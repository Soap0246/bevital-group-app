/**
 * Test harness: boots an embedded real PostgreSQL (PGlite), recreates the parts of the
 * Supabase platform our migrations depend on (roles, auth schema, storage schema), then
 * applies every migration and seed in supabase/ exactly as `supabase db reset` would.
 *
 * Tests run queries *as* a given user: `SET LOCAL ROLE authenticated` plus the JWT claims
 * that auth.uid() reads — so Row Level Security is genuinely enforced.
 */
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUPABASE_DIR = path.join(ROOT, 'supabase');

export const IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  patient1: '00000000-0000-4000-8000-000000000101',
  patient2: '00000000-0000-4000-8000-000000000102',
  therapist1: '00000000-0000-4000-8000-000000000201',
  therapist2: '00000000-0000-4000-8000-000000000202',
  therapist3: '00000000-0000-4000-8000-000000000203',
  therapist4: '00000000-0000-4000-8000-000000000204',
  therapist5: '00000000-0000-4000-8000-000000000205',
  clinicKL: 'c0000000-0000-4000-8000-000000000001',
  clinicPJ: 'c0000000-0000-4000-8000-000000000002',
  patient1Address: 'a0000000-0000-4000-8000-000000000101',
  child: 'f0000000-0000-4000-8000-000000000101',
  parent: 'f0000000-0000-4000-8000-000000000102',
  pack5: 'b0000000-0000-4000-8000-000000000001',
};

const BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create schema extensions;
  create schema storage;
  create extension pgcrypto with schema extensions;

  create table auth.users (
    instance_id uuid, id uuid primary key, aud text, role text, email text, phone text,
    encrypted_password text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now(), updated_at timestamptz default now(),
    confirmation_token text, recovery_token text, email_change_token_new text, email_change text,
    email_change_token_current text, reauthentication_token text, phone_change text, phone_change_token text
  );
  create table auth.identities (
    id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade,
    identity_data jsonb, provider text, provider_id text, last_sign_in_at timestamptz,
    created_at timestamptz, updated_at timestamptz, unique (provider_id, provider)
  );

  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon')
  $$;

  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text, owner uuid
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
  $$;

  grant usage on schema auth, extensions, storage to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema storage to anon, authenticated, service_role;
  grant execute on all functions in schema extensions to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated, service_role;
  grant select on storage.objects, storage.buckets to anon, authenticated;
  grant all on storage.buckets to service_role;
`;

function readSql(file) {
  return fs.readFileSync(file, 'utf8');
}

export async function createDb({ devSeed = true } = {}) {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db.exec(BOOTSTRAP);
  await db.exec('set search_path = public, extensions;');

  const migrationsDir = path.join(SUPABASE_DIR, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try {
      await db.exec(readSql(path.join(migrationsDir, f)));
    } catch (err) {
      err.message = `Migration ${f} failed: ${err.message}`;
      throw err;
    }
  }
  await db.exec(readSql(path.join(SUPABASE_DIR, 'seed.sql')));
  if (devSeed) await db.exec(readSql(path.join(SUPABASE_DIR, 'seed_dev.sql')));
  return db;
}

/** Returns a query helper that executes each call as `userId` (or anon when null). */
export function as(db, userId, { role } = {}) {
  const pgRole = role ?? (userId ? 'authenticated' : 'anon');
  const claims = JSON.stringify(userId ? { sub: userId, role: pgRole } : { role: pgRole });

  async function run(fn, { commit }) {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${pgRole}`);
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      const out = await fn({
        query: async (sql, params) => (await db.query(sql, params)).rows,
        one: async (sql, params) => (await db.query(sql, params)).rows[0],
        // Run a statement expected to fail without poisoning the surrounding transaction.
        attempt: async (sql, params) => {
          await db.exec('savepoint attempt');
          try {
            const r = await db.query(sql, params);
            await db.exec('release savepoint attempt');
            return { ok: true, rows: r.rows };
          } catch (error) {
            await db.exec('rollback to savepoint attempt');
            return { ok: false, error };
          }
        },
      });
      await db.exec(commit ? 'commit' : 'rollback');
      return out;
    } catch (e) {
      await db.exec('rollback');
      throw e;
    }
  }

  return {
    /** Single statement; commits. Throws on error. */
    query: (sql, params) => run((q) => q.query(sql, params), { commit: true }),
    one: (sql, params) => run((q) => q.one(sql, params), { commit: true }),
    /** Single statement; always rolled back (for read checks that must not persist). */
    peek: (sql, params) => run((q) => q.query(sql, params), { commit: false }),
    /** Returns { ok, rows } or { ok:false, error } instead of throwing; rolled back on failure. */
    attempt: async (sql, params) => {
      try {
        const rows = await run((q) => q.query(sql, params), { commit: true });
        return { ok: true, rows };
      } catch (error) {
        return { ok: false, error };
      }
    },
    /** Multiple statements in one transaction. */
    tx: (fn, { commit = true } = {}) => run(fn, { commit }),
  };
}

/** Run as the service role (webhooks / cron). */
export const asService = (db) => as(db, null, { role: 'service_role' });

// ───────────────────────── Time helpers (Asia/Kuala_Lumpur = UTC+8, no DST) ─────────────────────────
const klFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

/** First calendar date (KL) at least `minDaysAhead` days from now falling on ISO weekday (1=Mon..7=Sun). */
export function klDate(minDaysAhead, isoWeekday) {
  let d = new Date(Date.now() + minDaysAhead * 86400000);
  for (let i = 0; i < 8; i++) {
    const s = klFormat.format(d);
    const [y, m, dd] = s.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay() || 7;
    if (dow === isoWeekday) return s;
    d = new Date(d.getTime() + 86400000);
  }
  throw new Error('unreachable');
}

export const klTs = (dateStr, hhmm) => `${dateStr}T${hhmm}:00+08:00`;

export function errorCode(result) {
  const m = /BV_[A-Z_]+/.exec(result?.error?.message ?? '');
  return m ? m[0] : result?.error?.message;
}

export async function serviceId(db, slug) {
  const r = await db.query('select id from public.services where slug = $1', [slug]);
  return r.rows[0].id;
}
export async function therapistId(db, userId) {
  const r = await db.query('select id from public.therapist_profiles where user_id = $1', [userId]);
  return r.rows[0].id;
}

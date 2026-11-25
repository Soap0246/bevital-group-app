import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDb, as, IDS } from './harness.mjs';

const read = (f) => fs.readFileSync(path.join(process.cwd(), 'supabase', f), 'utf8');

describe('update scripts for the live test project', () => {
  let db;
  before(async () => { db = await createDb(); });
  after(async () => { await db.close?.(); });

  it('clean_demo_labels.sql runs and removes "Demo" wording from names', async () => {
    await db.exec(read('clean_demo_labels.sql'));
    await db.exec(read('clean_demo_labels.sql')); // idempotent
    const { rows } = await db.query(`select count(*)::int as n from public.users where full_name ilike 'Demo %'`);
    assert.equal(rows[0].n, 0);
    const t = await db.query(`select display_name from public.therapist_profiles where display_name ilike '%demo%'`);
    assert.equal(t.rows.length, 0);
    const f = await db.query(`select 1 from public.family_members where full_name ilike 'demo%'`);
    assert.equal(f.rows.length, 0);
  });

  it('therapist_public_stats exposes only an approved registration number and a session count', async () => {
    const t1 = (await db.query(`select tp.id from public.therapist_profiles tp join public.users u on u.id = tp.user_id where u.email = 'therapist1@dev.bevital.test'`)).rows[0].id;
    await db.query(
      `insert into public.therapist_credentials (therapist_id, credential_type, title, credential_number, status)
       values ($1, 'mahpc_registration', 'Council registration', 'PT-12345', 'approved'),
              ($1, 'mahpc_registration', 'Old pending', 'PT-PENDING', 'submitted')`, [t1]);
    const patient = as(db, IDS.patient1);
    const rows = await patient.query(`select * from public.therapist_public_stats(array[$1]::uuid[])`, [t1]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].registration_number, 'PT-12345');
    assert.equal(typeof rows[0].completed_sessions, 'number');
    // anonymous callers get nothing
    const anon = as(db, null, { role: 'anon' });
    const denied = await anon.attempt(`select * from public.therapist_public_stats(array[$1]::uuid[])`, [t1]);
    assert.equal(denied.ok, false);
  });

  it('physio_only_update.sql is idempotent on a seeded database', async () => {
    await db.exec(read('physio_only_update.sql'));
    const { rows } = await db.query(`select count(*)::int as n from public.service_categories where is_active`);
    assert.equal(rows[0].n, 8);
  });
});

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, IDS } from './harness.mjs';
import * as shared from '../../packages/shared/src/enums.ts';

describe('schema, seed data and shared-type parity', () => {
  let db;
  before(async () => {
    db = await createDb();
  });

  const SPEC_TABLES = [
    'users', 'patient_profiles', 'family_members', 'therapist_profiles', 'therapist_credentials',
    'therapist_availability', 'clinics', 'services', 'service_categories', 'bookings',
    'booking_status_history', 'patient_medical_records', 'treatment_sessions', 'clinical_notes',
    'exercise_programmes', 'exercise_completions', 'payments', 'payment_transactions', 'packages',
    'package_purchases', 'package_redemptions', 'reviews', 'notifications', 'addresses',
    'promotions', 'audit_logs',
  ];

  it('creates every table required by the specification', async () => {
    const { rows } = await db.query(`select tablename from pg_tables where schemaname = 'public'`);
    const have = new Set(rows.map((r) => r.tablename));
    for (const t of SPEC_TABLES) assert.ok(have.has(t), `missing table ${t}`);
  });

  it('enables Row Level Security on every public table', async () => {
    const { rows } = await db.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    assert.deepEqual(rows.map((r) => r.relname), [], 'tables without RLS');
  });

  it('keeps TypeScript enums in sync with Postgres enums', async () => {
    const pairs = {
      booking_status: shared.BOOKING_STATUSES,
      user_role: shared.USER_ROLES,
      appointment_type: shared.APPOINTMENT_TYPES,
      verification_status: shared.VERIFICATION_STATUSES,
      credential_status: shared.CREDENTIAL_STATUSES,
      credential_type: shared.CREDENTIAL_TYPES,
      payment_status: shared.PAYMENT_STATUSES,
      payment_method: shared.PAYMENT_METHODS,
      record_type: shared.RECORD_TYPES,
      relationship_type: shared.RELATIONSHIPS,
      consent_basis: shared.CONSENT_BASES,
      notification_type: shared.NOTIFICATION_TYPES,
    };
    for (const [pgEnum, tsValues] of Object.entries(pairs)) {
      const { rows } = await db.query(
        `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = $1 order by e.enumsortorder`, [pgEnum]);
      assert.deepEqual(rows.map((r) => r.enumlabel), [...tsValues], `enum mismatch: ${pgEnum}`);
    }
  });

  it('keeps TypeScript booking transitions in sync with the database state machine', async () => {
    const { rows } = await db.query(
      `select from_status, to_status, allowed_roles::text[] as roles, home_only
         from public.booking_status_transitions where cardinality(allowed_roles) > 0`);
    const fromDb = rows.map((r) => `${r.from_status}>${r.to_status}|${[...r.roles].sort()}|${r.home_only}`).sort();
    const fromTs = shared.BOOKING_TRANSITIONS
      .map((t) => `${t.from}>${t.to}|${[...t.roles].sort()}|${Boolean(t.homeOnly)}`).sort();
    assert.deepEqual(fromTs, fromDb);
  });

  it('seeds the 12 required physiotherapy categories with matching slugs', async () => {
    const { rows } = await db.query(`select slug, name from public.service_categories order by sort_order`);
    assert.equal(rows.length, 12);
    assert.deepEqual(rows.map((r) => r.slug), [...shared.SERVICE_CATEGORY_SLUGS]);
    assert.ok(rows.some((r) => r.name === 'Post-Operative Rehabilitation'));
    assert.ok(rows.some((r) => r.name === 'Spine and Posture Rehabilitation'));
  });

  it('seeds services with every field the marketplace needs', async () => {
    const { rows } = await db.query(`
      select s.slug, s.description, s.conditions_treated, s.treatment_objectives, s.duration_minutes,
             s.supports_clinic, s.supports_home, s.price_clinic, s.price_home
        from public.services s`);
    assert.ok(rows.length >= 24);
    for (const s of rows) {
      assert.ok(s.description.length > 20, `${s.slug} description`);
      assert.ok(s.conditions_treated.length > 0, `${s.slug} conditions`);
      assert.ok(s.treatment_objectives.length > 0, `${s.slug} objectives`);
      assert.ok(s.duration_minutes >= 15, `${s.slug} duration`);
      if (s.supports_clinic) assert.ok(s.price_clinic !== null, `${s.slug} clinic price`);
      if (s.supports_home) assert.ok(s.price_home !== null, `${s.slug} home price`);
    }
    // every category has at least one service
    const empty = await db.query(`select c.slug from public.service_categories c
      where not exists (select 1 from public.services s where s.category_id = c.id)`);
    assert.deepEqual(empty.rows, []);
  });

  it('only physiotherapy is active in release 1 (future lines are data, not code)', async () => {
    const { rows } = await db.query(`select slug, is_active from public.service_lines`);
    assert.deepEqual(rows, [{ slug: 'physiotherapy', is_active: true }]);
  });

  it('enforces data validation constraints', async () => {
    const bad = [
      [`insert into public.services (category_id, slug, name, description, duration_minutes, supports_clinic, supports_home)
         select id, 'x1', 'x', 'x', 60, false, false from public.service_categories limit 1`, /services_some_location/],
      [`insert into public.services (category_id, slug, name, description, duration_minutes, supports_clinic, price_clinic)
         select id, 'x2', 'x', 'x', 5, true, 10 from public.service_categories limit 1`, /duration_minutes/],
      [`insert into public.promotions (code, title, discount_type, discount_value) values ('lower', 't', 'percent', 10)`, /code/],
      [`insert into public.promotions (code, title, discount_type, discount_value) values ('TOOBIG', 't', 'percent', 150)`, /promo_percent_range/],
      [`update public.users set phone = '0123456789' where id = '${IDS.patient1}'`, /users_phone_e164/],
      [`insert into public.addresses (user_id, line1, city, state, postcode, latitude, longitude)
         values ('${IDS.patient1}', 'a', 'b', 'c', '1234', 3, 101)`, /postcode/],
    ];
    for (const [sql, pattern] of bad) {
      await assert.rejects(db.query(sql), pattern, sql.slice(0, 60));
    }
  });

  it('exposes only public settings to anonymous clients', async () => {
    const anon = as(db, null);
    const rows = await anon.query(`select key from public.system_settings`);
    const keys = rows.map((r) => r.key);
    assert.ok(keys.includes('travel_fee_per_km'));
    assert.ok(!keys.includes('platform_commission_rate'));
    assert.ok(!keys.includes('travel_distance_factor'));
  });

  it('seeds synthetic dev accounts: 4 verified therapists and 1 pending', async () => {
    const { rows } = await db.query(
      `select verification_status, count(*)::int as n from public.therapist_profiles group by 1 order by 1`);
    assert.deepEqual(rows, [{ verification_status: 'pending', n: 1 }, { verification_status: 'verified', n: 4 }]);
    const users = await db.query(`select email from public.users where email not like '%.test'`);
    assert.deepEqual(users.rows, [], 'dev seed must only use reserved .test addresses');
  });
});

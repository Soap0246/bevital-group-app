import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, asService, IDS, klDate, klTs, errorCode, serviceId, therapistId } from './harness.mjs';

const denied = (r) => assert.equal(r.ok, false, 'expected the operation to be refused');
const refused = (r) => assert.ok(!r.ok || r.rows.length === 0, 'expected no rows / refusal');

describe('security: roles, RLS and sensitive data', () => {
  let db, ANON, P1, P2, T1, T2, T3, T5, ADMIN, SVC, tid, booking, noConsentBooking;

  before(async () => {
    db = await createDb();
    ANON = as(db, null);
    P1 = as(db, IDS.patient1); P2 = as(db, IDS.patient2);
    T1 = as(db, IDS.therapist1); T2 = as(db, IDS.therapist2); T3 = as(db, IDS.therapist3); T5 = as(db, IDS.therapist5);
    ADMIN = as(db, IDS.admin);
    SVC = await serviceId(db, 'msk-assessment');
    tid = { t1: await therapistId(db, IDS.therapist1), t5: await therapistId(db, IDS.therapist5) };
    await db.query(`update public.system_settings set value = '"sandbox-test"' where key = 'payment_provider'`);

    // Booking with consent to share records (patient1 -> therapist1) and one without (patient2 -> therapist1).
    const wed = klDate(3, 3);
    const mk = async (who, start, share) => (await who.one(
      `select * from public.create_booking($1, 'clinic', $2::timestamptz, $3, null, $4, null, null, null, null, null, $5)`,
      [SVC, klTs(wed, start), IDS.clinicKL, tid.t1, share]));
    booking = await mk(P1, '09:00', true);
    noConsentBooking = await mk(P2, '11:00', false);
    for (const [who, b] of [[P1, booking], [P2, noConsentBooking]]) {
      const p = await who.one(`select * from public.initiate_payment($1, 'fpx')`, [b.id]);
      await asService(db).one(`select * from public.confirm_payment($1, $2, $3)`, [p.id, `ref-${p.id}`, p.amount]);
      await T1.one(`select * from public.therapist_respond_to_booking($1, true)`, [b.id]);
    }
  });

  describe('anonymous visitors', () => {
    it('can browse the public catalogue only', async () => {
      assert.ok((await ANON.query(`select 1 from public.services`)).length >= 24);
      assert.ok((await ANON.query(`select 1 from public.clinics`)).length === 2);
      for (const t of ['users', 'bookings', 'payments', 'therapist_profiles', 'patient_medical_records', 'notifications', 'audit_logs']) {
        denied(await ANON.attempt(`select 1 from public.${t}`));
      }
    });
  });

  describe('privilege escalation', () => {
    it('stops users granting themselves roles, reactivating or changing email', async () => {
      for (const sql of [
        `update public.users set role = 'admin' where id = '${IDS.patient1}'`,
        `update public.users set is_active = false where id = '${IDS.patient1}'`,
        `update public.users set email = 'attacker@x.test' where id = '${IDS.patient1}'`,
      ]) {
        const r = await P1.attempt(sql);
        denied(r);
        assert.match(r.error.message, /BV_FORBIDDEN/);
      }
      await P1.query(`update public.users set full_name = 'Renamed Patient' where id = '${IDS.patient1}'`);
      assert.equal((await P1.one(`select full_name from public.users where id = $1`, [IDS.patient1])).full_name, 'Renamed Patient');
    });

    it('prevents editing another user\'s profile', async () => {
      const r = await P1.query(`update public.users set full_name = 'Hacked' where id = '${IDS.patient2}' returning id`);
      assert.equal(r.length, 0);
      assert.equal((await db.query(`select full_name from public.users where id = $1`, [IDS.patient2])).rows[0].full_name, 'Demo Patient Two');
    });

    it('stops the signup trigger from ever creating an admin', async () => {
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
        ('99999999-0000-4000-8000-000000000001', 'evil@dev.bevital.test', '{"role":"admin","full_name":"Evil"}')`);
      const u = (await db.query(`select role from public.users where id = '99999999-0000-4000-8000-000000000001'`)).rows[0];
      assert.equal(u.role, 'patient');
      await db.query(`delete from auth.users where id = '99999999-0000-4000-8000-000000000001'`);
    });

    it('stops therapists verifying themselves or editing ratings; admin can verify', async () => {
      for (const sql of [
        `update public.therapist_profiles set verification_status = 'verified' where user_id = '${IDS.therapist5}'`,
        `update public.therapist_profiles set rating_avg = 5, rating_count = 99 where user_id = '${IDS.therapist5}'`,
        `update public.therapist_profiles set clinic_id = '${IDS.clinicKL}' where user_id = '${IDS.therapist5}'`,
      ]) denied(await T5.attempt(sql));
      await T5.query(`update public.therapist_profiles set bio = 'Hello' where user_id = '${IDS.therapist5}'`);

      await ADMIN.query(`update public.therapist_profiles set verification_status = 'verified' where user_id = '${IDS.therapist5}'`);
      const row = (await db.query(`select verification_status, verified_at, verified_by from public.therapist_profiles where user_id = $1`, [IDS.therapist5])).rows[0];
      assert.equal(row.verification_status, 'verified');
      assert.ok(row.verified_at);
      assert.equal(row.verified_by, IDS.admin);
      // restore for later assertions
      await db.query(`update public.therapist_profiles set verification_status = 'pending' where user_id = $1`, [IDS.therapist5]);
    });
  });

  describe('data isolation', () => {
    it('patients see only their own account row and bookings', async () => {
      // Patient 2 has a booking with therapist 1, yet must see neither other patients nor the
      // therapist's account row (therapists are exposed through therapist_profiles only).
      assert.deepEqual((await P2.query(`select id from public.users`)).map((r) => r.id), [IDS.patient2]);
    });

    it('hides other patients\' bookings, payments, notifications and family members', async () => {
      assert.equal((await P2.query(`select 1 from public.bookings where id = $1`, [booking.id])).length, 0);
      assert.equal((await P2.query(`select 1 from public.payments where booking_id = $1`, [booking.id])).length, 0);
      assert.equal((await P2.query(`select 1 from public.family_members`)).length, 0);
      assert.ok((await P1.query(`select 1 from public.family_members`)).length >= 2);
      const mine = await P1.query(`select user_id from public.notifications`);
      assert.ok(mine.length > 0 && mine.every((n) => n.user_id === IDS.patient1));
    });

    it('does not let clients write bookings, payments, history or notifications directly', async () => {
      for (const [who, sql] of [
        [P1, `update public.bookings set status = 'completed' where id = '${booking.id}'`],
        [P1, `delete from public.bookings where id = '${booking.id}'`],
        [ADMIN, `update public.bookings set status = 'cancelled' where id = '${booking.id}'`],
        [P1, `insert into public.notifications (user_id, type, title, body) values ('${IDS.patient1}', 'system', 'x', 'y')`],
        [P1, `insert into public.booking_status_history (booking_id, to_status) values ('${booking.id}', 'completed')`],
        [ADMIN, `update public.payments set status = 'succeeded'`],
        [P1, `insert into public.audit_logs (action, entity_type) values ('x', 'y')`],
      ]) denied(await who.attempt(sql));
    });

    it('lets a therapist see only bookings assigned to them', async () => {
      assert.equal((await T3.query(`select 1 from public.bookings`)).length, 0);
      assert.equal((await T1.query(`select 1 from public.bookings`)).length, 2);
      const patients = (await T1.query(`select id from public.users`)).map((r) => r.id);
      assert.ok(patients.includes(IDS.patient1) && patients.includes(IDS.patient2));
      assert.ok(!patients.includes(IDS.therapist2));
      assert.equal((await T3.query(`select id from public.users where role = 'patient'`)).length, 0);
    });

    it('only shows verified therapists to patients', async () => {
      const seen = (await P1.query(`select user_id from public.therapist_profiles`)).map((r) => r.user_id);
      assert.equal(seen.length, 4);
      assert.ok(!seen.includes(IDS.therapist5));
      assert.equal((await P1.query(`select 1 from public.therapist_private`)).length, 0, 'therapist home base never exposed');
    });

    it('keeps therapist credentials private to the owner and admins', async () => {
      await T5.query(`insert into public.therapist_credentials (therapist_id, credential_type, title, credential_number)
        select id, 'annual_practising_certificate', 'APC (demo)', 'DEMO-0001' from public.therapist_profiles where user_id = '${IDS.therapist5}'`);
      assert.equal((await db.query(`select verification_status from public.therapist_profiles where user_id = $1`, [IDS.therapist5])).rows[0].verification_status,
        'under_review', 'submitting a credential queues the therapist for verification');
      assert.equal((await T5.query(`select 1 from public.therapist_credentials`)).length, 1);
      assert.equal((await T1.query(`select 1 from public.therapist_credentials`)).length, 0);
      assert.equal((await P1.query(`select 1 from public.therapist_credentials`)).length, 0);
      assert.equal((await ADMIN.query(`select 1 from public.therapist_credentials`)).length, 1);

      denied(await T5.attempt(`update public.therapist_credentials set status = 'approved'`));
      await ADMIN.query(`update public.therapist_credentials set status = 'approved', review_notes = 'Checked against register (demo)'`);
      const c = (await db.query(`select reviewed_by, reviewed_at from public.therapist_credentials`)).rows[0];
      assert.equal(c.reviewed_by, IDS.admin);
      assert.ok(c.reviewed_at);
      // approved credentials are locked from further edits by the therapist
      assert.equal((await T5.query(`update public.therapist_credentials set title = 'Edited' returning id`)).length, 0);
    });
  });

  describe('clinical information', () => {
    it('is invisible to admins, therapists and other patients through the tables', async () => {
      assert.equal((await P1.query(`select 1 from public.patient_medical_records`)).length, 2);
      for (const who of [P2, T1, T3, ADMIN]) {
        assert.equal((await who.query(`select 1 from public.patient_medical_records`)).length, 0);
        assert.equal((await who.query(`select 1 from public.patient_profiles where user_id = '${IDS.patient1}'`)).length, 0);
      }
    });

    it('cannot be written for someone else\'s family member', async () => {
      const r = await P2.attempt(`insert into public.patient_medical_records (patient_user_id, family_member_id, record_type, title)
        values ('${IDS.patient2}', '${IDS.child}', 'condition', 'x')`);
      denied(r);
    });

    it('is released to a therapist only through the audited, consent-checked function', async () => {
      const health = await T1.one(`select public.therapist_get_patient_health($1) as h`, [booking.id]);
      assert.equal(health.h.patient.name, 'Renamed Patient');
      assert.equal(health.h.records.length, 2);
      assert.equal(health.h.emergency_contact.name, 'Demo Contact');

      const log = (await db.query(`select actor_user_id, actor_role, entity_id from public.audit_logs where action = 'view_health_record'`)).rows;
      assert.equal(log.length, 1);
      assert.equal(log[0].actor_user_id, IDS.therapist1);
      assert.equal(log[0].actor_role, 'therapist');
      assert.equal(log[0].entity_id, booking.id);

      assert.equal(errorCode(await T1.attempt(`select public.therapist_get_patient_health($1)`, [noConsentBooking.id])), 'BV_CONSENT_REQUIRED');
      assert.equal(errorCode(await T3.attempt(`select public.therapist_get_patient_health($1)`, [booking.id])), 'BV_FORBIDDEN');
      assert.equal(errorCode(await P1.attempt(`select public.therapist_get_patient_health($1)`, [booking.id])), 'BV_FORBIDDEN');
    });

    it('lets the patient revoke sharing at any time', async () => {
      await P1.query(`select public.set_booking_record_sharing($1, false)`, [booking.id]);
      assert.equal(errorCode(await T1.attempt(`select public.therapist_get_patient_health($1)`, [booking.id])), 'BV_CONSENT_REQUIRED');
      const consent = await P1.query(`select revoked_at from public.consents where consent_type = 'therapist_record_access' order by created_at desc`);
      assert.ok(consent.some((c) => c.revoked_at));
      await P1.query(`select public.set_booking_record_sharing($1, true)`, [booking.id]);
    });

    it('shares clinical notes with the patient only when the therapist chooses to', async () => {
      const note = await T1.one(`insert into public.clinical_notes (booking_id, therapist_id, patient_user_id, subjective, assessment, plan, patient_summary)
        values ($1, $2, $3, 'S', 'A', 'P', 'Plain-language summary') returning *`, [booking.id, tid.t1, IDS.patient1]);
      assert.equal((await P1.query(`select 1 from public.clinical_notes`)).length, 0);
      assert.equal((await T1.query(`select 1 from public.clinical_notes`)).length, 1);
      assert.equal((await ADMIN.query(`select 1 from public.clinical_notes`)).length, 0);
      assert.equal((await T3.query(`select 1 from public.clinical_notes`)).length, 0);
      await T1.query(`update public.clinical_notes set share_with_patient = true where id = $1`, [note.id]);
      assert.equal((await P1.query(`select 1 from public.clinical_notes`)).length, 1);
      assert.equal((await P2.query(`select 1 from public.clinical_notes`)).length, 0);

      // another therapist cannot document against a patient they do not treat
      denied(await T3.attempt(`insert into public.clinical_notes (booking_id, therapist_id, patient_user_id, plan)
        values ($1, (select id from public.therapist_profiles where user_id = '${IDS.therapist3}'), $2, 'x')`, [booking.id, IDS.patient1]));
      // a note cannot be attached to a booking belonging to a different patient
      denied(await T1.attempt(`insert into public.clinical_notes (booking_id, therapist_id, patient_user_id, plan) values ($1, $2, $3, 'x')`,
        [booking.id, tid.t1, IDS.patient2]));
    });

    it('limits exercise prescriptions to treating therapists and logs completions for the owner', async () => {
      const prog = await T1.one(`insert into public.exercise_programmes (patient_user_id, therapist_id, title, booking_id)
        values ($1, $2, 'Back mobility (demo)', $3) returning *`, [IDS.patient1, tid.t1, booking.id]);
      const item = await T1.one(`insert into public.exercise_programme_items (programme_id, name, sets, reps) values ($1, 'Cat-camel', 2, 10) returning *`, [prog.id]);
      denied(await T3.attempt(`insert into public.exercise_programmes (patient_user_id, therapist_id, title)
        values ($1, (select id from public.therapist_profiles where user_id = '${IDS.therapist3}'), 'x')`, [IDS.patient1]));
      assert.equal((await P2.query(`select 1 from public.exercise_programmes`)).length, 0);
      assert.equal((await P1.query(`select 1 from public.exercise_programme_items`)).length, 1);

      await P1.query(`insert into public.exercise_completions (programme_item_id, patient_user_id, pain_level) values ($1, $2, 3)`, [item.id, IDS.patient1]);
      denied(await P2.attempt(`insert into public.exercise_completions (programme_item_id, patient_user_id) values ($1, $2)`, [item.id, IDS.patient2]));
      denied(await P2.attempt(`insert into public.exercise_completions (programme_item_id, patient_user_id) values ($1, $2)`, [item.id, IDS.patient1]));
      assert.equal((await T1.query(`select 1 from public.exercise_completions`)).length, 1, 'therapist sees adherence');
      assert.equal((await T3.query(`select 1 from public.exercise_completions`)).length, 0);
    });
  });

  describe('storage buckets', () => {
    const put = (who, bucket, name) => who.attempt(
      `insert into storage.objects (bucket_id, name, owner) values ($1, $2, auth.uid())`, [bucket, name]);

    it('keeps medical documents to the owner and a consented treating therapist', async () => {
      const path = `${IDS.patient1}/self/xray.pdf`;
      assert.ok((await put(P1, 'medical-documents', path)).ok);
      denied(await put(P2, 'medical-documents', `${IDS.patient1}/self/injected.pdf`));
      const read = (who) => who.query(`select 1 from storage.objects where bucket_id = 'medical-documents' and name = $1`, [path]);
      assert.equal((await read(P1)).length, 1);
      assert.equal((await read(T1)).length, 1, 'consented treating therapist');
      assert.equal((await read(T3)).length, 0);
      assert.equal((await read(P2)).length, 0);
      assert.equal((await read(ADMIN)).length, 0, 'admins cannot read medical documents');
      await P1.query(`select public.set_booking_record_sharing($1, false)`, [booking.id]);
      assert.equal((await read(T1)).length, 0, 'revoking consent removes access');
      await P1.query(`select public.set_booking_record_sharing($1, true)`, [booking.id]);
    });

    it('keeps credential files private to the therapist and admins; photos are public', async () => {
      assert.ok((await put(T1, 'therapist-credentials', `${IDS.therapist1}/apc.pdf`)).ok);
      denied(await put(P1, 'therapist-credentials', `${IDS.patient1}/apc.pdf`));
      denied(await put(T1, 'therapist-credentials', `${IDS.therapist2}/apc.pdf`));
      const read = (who) => who.query(`select 1 from storage.objects where bucket_id = 'therapist-credentials'`);
      assert.equal((await read(T1)).length, 1);
      assert.equal((await read(ADMIN)).length, 1);
      assert.equal((await read(T2)).length, 0);
      assert.equal((await read(P1)).length, 0);
      assert.equal((await read(ANON)).length, 0);

      assert.ok((await put(T1, 'therapist-photos', `${IDS.therapist1}/me.jpg`)).ok);
      assert.equal((await ANON.query(`select 1 from storage.objects where bucket_id = 'therapist-photos'`)).length, 1);
      denied(await put(P1, 'exercise-media', `${IDS.patient1}/v.mp4`));
    });

    it('configures buckets: only photos and exercise media are public', async () => {
      const { rows } = await db.query(`select id, public from storage.buckets order by id`);
      assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, r.public])), {
        'exercise-media': true, 'medical-documents': false, 'therapist-credentials': false, 'therapist-photos': true,
      });
    });
  });

  describe('API surface and audit trail', () => {
    it('keeps server-only and internal functions away from clients', async () => {
      for (const sql of [
        `select public.confirm_payment('${booking.id}', 'x', 1)`,
        `select public.fail_payment('${booking.id}', 'x')`,
        `select public.enqueue_appointment_reminders()`,
        `select public.expire_stale_holds()`,
        `select public.notify('${IDS.patient1}', 'system', 'x', 'y')`,
        `select public.log_audit('x', 'y', 'z')`,
        `select * from public._pick_candidates('${SVC}', 'clinic', now(), now(), null, null, null)`,
      ]) {
        denied(await P1.attempt(sql));
        denied(await ANON.attempt(sql));
        denied(await ADMIN.attempt(sql));
      }
    });

    it('records privileged changes and is append-only', async () => {
      const rows = (await ADMIN.query(`select action, entity_type, actor_role from public.audit_logs`));
      assert.ok(rows.length > 0);
      assert.ok(rows.some((r) => r.entity_type === 'therapist_profiles' && r.actor_role === 'admin'));
      assert.equal((await P1.query(`select 1 from public.audit_logs`)).length, 0);
      assert.equal((await T1.query(`select 1 from public.audit_logs`)).length, 0);

      const change = (await db.query(`select metadata from public.audit_logs where entity_type = 'therapist_credentials' and action = 'update' limit 1`)).rows[0];
      assert.ok(change.metadata.changes.status, 'status change is logged');
      assert.equal(change.metadata.changes.credential_number, undefined);

      await assert.rejects(db.query(`update public.audit_logs set action = 'tampered'`), /append-only/);
      await assert.rejects(db.query(`delete from public.audit_logs`), /append-only/);
    });

    it('keeps non-public settings and admin-only catalogue writes away from patients', async () => {
      assert.equal((await P1.query(`select 1 from public.system_settings where key = 'platform_commission_rate'`)).length, 0);
      assert.equal((await ADMIN.query(`select 1 from public.system_settings where key = 'platform_commission_rate'`)).length, 1);
      // RLS filters these UPDATEs to zero rows (no error), so assert the data is untouched.
      assert.equal((await P1.query(`update public.system_settings set value = '0' where key = 'platform_fee' returning key`)).length, 0);
      assert.equal((await T1.query(`update public.services set price_clinic = 1 returning id`)).length, 0);
      assert.equal((await db.query(`select value from public.system_settings where key = 'platform_fee'`)).rows[0].value, 3);
      assert.equal((await db.query(`select count(*)::int as n from public.services where price_clinic = 1`)).rows[0].n, 0);
      await ADMIN.query(`update public.services set price_clinic = 155 where slug = 'msk-followup'`);
      assert.equal((await db.query(`select price_clinic from public.services where slug = 'msk-followup'`)).rows[0].price_clinic, '155.00');
    });

    it('blocks deactivated accounts from taking actions', async () => {
      await ADMIN.query(`update public.users set is_active = false where id = '${IDS.patient2}'`);
      const wed = klDate(3, 3);
      const r = await P2.attempt(`select * from public.create_booking($1, 'clinic', $2::timestamptz, $3)`, [SVC, klTs(wed, '14:00'), IDS.clinicKL]);
      assert.equal(errorCode(r), 'BV_FORBIDDEN');
      await ADMIN.query(`update public.users set is_active = true where id = '${IDS.patient2}'`);
    });

    it('lets users manage their own push tokens only', async () => {
      await P1.query(`insert into public.push_tokens (user_id, token, platform) values ($1, 'ExponentPushToken[abc]', 'android')`, [IDS.patient1]);
      denied(await P1.attempt(`insert into public.push_tokens (user_id, token, platform) values ($1, 'ExponentPushToken[evil]', 'ios')`, [IDS.patient2]));
      assert.equal((await P2.query(`select 1 from public.push_tokens`)).length, 0);
    });
  });
});

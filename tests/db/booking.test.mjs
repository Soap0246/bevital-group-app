import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, asService, IDS, klDate, klTs, errorCode, serviceId, therapistId } from './harness.mjs';

const iso = (t) => new Date(t).toISOString();
const num = (v) => Number(v);

describe('booking engine', () => {
  let db, P1, P2, T1, T3, T4, ADMIN, SVC, SVC_FOLLOWUP, SVC_HOME, svc;
  let tid; // therapist profile ids by key
  let wed, thu, sun;

  before(async () => {
    db = await createDb();
    P1 = as(db, IDS.patient1);
    P2 = as(db, IDS.patient2);
    T1 = as(db, IDS.therapist1);
    T3 = as(db, IDS.therapist3);
    T4 = as(db, IDS.therapist4);
    ADMIN = as(db, IDS.admin);
    svc = asService(db);
    SVC = await serviceId(db, 'msk-assessment');
    SVC_FOLLOWUP = await serviceId(db, 'msk-followup');
    SVC_HOME = await serviceId(db, 'home-assessment');
    tid = {
      t1: await therapistId(db, IDS.therapist1),
      t2: await therapistId(db, IDS.therapist2),
      t3: await therapistId(db, IDS.therapist3),
      t4: await therapistId(db, IDS.therapist4),
      t5: await therapistId(db, IDS.therapist5),
    };
    wed = klDate(3, 3);
    thu = klDate(3, 4);
    sun = klDate(3, 7);
    // Make the pending "dev" scenario deterministic: payments are enabled for tests.
    await db.query(`update public.system_settings set value = '"sandbox-test"' where key = 'payment_provider'`);
  });

  const book = (who, args) => who.attempt(
    `select * from public.create_booking(
       p_service_id => $1, p_type => $2, p_start => $3, p_clinic_id => $4, p_address_id => $5,
       p_therapist_id => $6, p_family_member_id => $7, p_promo_code => $8, p_package_purchase_id => $9,
       p_notes => $10, p_symptoms => $11, p_share_records => $12, p_expected_total => $13)`,
    [args.service ?? SVC, args.type ?? 'clinic', args.start, args.clinic ?? (args.type === 'home' ? null : IDS.clinicKL),
     args.address ?? null, args.therapist ?? null, args.family ?? null, args.promo ?? null, args.pkg ?? null,
     args.notes ?? null, args.symptoms ?? null, args.share ?? false, args.expected ?? null]);

  const must = (r) => { assert.ok(r.ok, r.error?.message); return r.rows[0]; };

  async function pay(who, bookingId, amountOverride) {
    const p = await who.one(`select * from public.initiate_payment($1, 'fpx')`, [bookingId]);
    const confirmed = await svc.one(`select * from public.confirm_payment($1, $2, $3, '{"test":true}')`,
      [p.id, `prov-${p.id.slice(0, 8)}`, amountOverride ?? p.amount]);
    return confirmed;
  }
  const status = async (id) => (await db.query(`select status from public.bookings where id = $1`, [id])).rows[0].status;

  // ───────────────────────── availability ─────────────────────────
  describe('availability is derived from real schedules', () => {
    it('lists only times when a verified therapist at the clinic is working', async () => {
      const slots = await P1.query(
        `select * from public.get_available_times($1, 'clinic', $2::date, $3)`, [SVC, wed, IDS.clinicKL]);
      // Therapist 1 works 09:00-17:00 at KL; 60 minute service -> last start 16:00 on a 30 minute grid.
      assert.equal(slots.length, 15);
      assert.equal(iso(slots[0].start_at), iso(klTs(wed, '09:00')));
      assert.equal(iso(slots.at(-1).start_at), iso(klTs(wed, '16:00')));
      assert.ok(slots.every((s) => s.therapist_count === 1));
    });

    it('shows nothing on days nobody works, and nothing for clinics with no therapists', async () => {
      const sunday = await P1.query(`select * from public.get_available_times($1, 'clinic', $2::date, $3)`, [SVC, sun, IDS.clinicKL]);
      assert.equal(sunday.length, 0);
      const pj = await P1.query(`select * from public.get_available_times($1, 'clinic', $2::date, $3)`, [SVC, wed, IDS.clinicPJ]);
      assert.equal(pj.length, 15); // therapist 2 works Wed 10:00-18:00 at PJ
      assert.equal(iso(pj[0].start_at), iso(klTs(wed, '10:00')));
    });

    it('never exposes availability to anonymous callers', async () => {
      const r = await as(db, null).attempt(`select * from public.get_available_times($1, 'clinic', $2::date, $3)`, [SVC, wed, IDS.clinicKL]);
      assert.equal(r.ok, false);
    });

    it('requires a home-visit location inside a therapist service radius', async () => {
      const slots = await P1.query(
        `select * from public.get_available_times($1, 'home', $2::date, null, 3.149, 101.700)`, [SVC, wed]);
      assert.ok(slots.length > 15);
      // 10:00 is covered by therapist 1 (09-17) and therapist 4 (08-20) -> two choices
      const ten = slots.find((s) => iso(s.start_at) === iso(klTs(wed, '10:00')));
      assert.equal(ten.therapist_count, 2);
      // Far from every therapist base (Johor Bahru) -> no coverage, no fake availability
      const far = await P1.query(
        `select * from public.get_available_times($1, 'home', $2::date, null, 1.4927, 103.7414)`, [SVC, wed]);
      assert.equal(far.length, 0);
    });

    it('ranks home-visit therapists by distance and computes the travel fee', async () => {
      const rows = await P1.query(
        `select * from public.search_available_therapists($1, 'home', $2::timestamptz, null, 3.149, 101.700)`,
        [SVC, klTs(wed, '10:00')]);
      assert.equal(rows.length, 2);
      assert.equal(rows[0].therapist_id, tid.t1);
      assert.ok(num(rows[0].distance_km) < num(rows[1].distance_km));
      assert.equal(num(rows[0].travel_fee), 0); // inside the 3 km free zone
      assert.ok(num(rows[1].travel_fee) > 0);
      assert.equal(num(rows[0].service_price), 220);
    });

    it('does not list unverified therapists', async () => {
      const rows = await P1.query(
        `select therapist_id from public.search_available_therapists($1, 'clinic', $2::timestamptz, $3)`,
        [SVC, klTs(wed, '10:00'), IDS.clinicKL]);
      assert.ok(!rows.some((r) => r.therapist_id === tid.t5));
    });
  });

  // ───────────────────────── quoting & creation ─────────────────────────
  let b1, b2, bHome, bChild;
  describe('quotes and double-booking prevention', () => {
    it('quotes a clinic booking with a transparent breakdown', async () => {
      const q = await P1.one(`select public.quote_booking($1, 'clinic', $2::timestamptz, $3) as q`, [SVC, klTs(wed, '10:00'), IDS.clinicKL]);
      assert.equal(num(q.q.service_price), 150);
      assert.equal(num(q.q.travel_fee), 0);
      assert.equal(num(q.q.platform_fee), 3);
      assert.equal(num(q.q.total_amount), 153);
      assert.equal(q.q.therapist_id, tid.t1);
    });

    it('creates a pending booking with auto-matching and a payment hold', async () => {
      b1 = must(await book(P1, { start: klTs(wed, '10:00'), symptoms: 'Lower back stiffness', share: true }));
      assert.equal(b1.status, 'pending');
      assert.equal(b1.therapist_id, tid.t1);
      assert.equal(b1.auto_matched, true);
      assert.equal(num(b1.total_amount), 153);
      assert.ok(b1.hold_expires_at);
      assert.match(b1.reference, /^BV-\d{4,}$/);
      assert.equal(b1.share_records_consent, true);
    });

    it('removes the booked time (and overlaps) from availability immediately', async () => {
      const slots = await P2.query(`select start_at from public.get_available_times($1, 'clinic', $2::date, $3)`, [SVC, wed, IDS.clinicKL]);
      const starts = slots.map((s) => iso(s.start_at));
      assert.ok(!starts.includes(iso(klTs(wed, '09:30'))), '09:30 overlaps');
      assert.ok(!starts.includes(iso(klTs(wed, '10:00'))));
      assert.ok(!starts.includes(iso(klTs(wed, '10:30'))));
      assert.ok(starts.includes(iso(klTs(wed, '09:00'))), 'ends exactly when the booking starts');
      assert.ok(starts.includes(iso(klTs(wed, '11:00'))), 'starts exactly when the booking ends');
    });

    it('rejects a second booking for the same therapist and time', async () => {
      const specific = await book(P2, { start: klTs(wed, '10:00'), therapist: tid.t1 });
      assert.equal(errorCode(specific), 'BV_SLOT_UNAVAILABLE');
      const auto = await book(P2, { start: klTs(wed, '10:00') });
      assert.equal(errorCode(auto), 'BV_SLOT_UNAVAILABLE');
      const overlap = await book(P2, { start: klTs(wed, '10:30'), therapist: tid.t1 });
      assert.equal(errorCode(overlap), 'BV_SLOT_UNAVAILABLE');
    });

    it('lets the database itself refuse a double booking even if the function were bypassed', async () => {
      await assert.rejects(db.query(`
        insert into public.bookings (patient_user_id, service_id, appointment_type, clinic_id, therapist_id,
          scheduled_start, scheduled_end, service_price, total_amount)
        values ('${IDS.patient2}', '${SVC}', 'clinic', '${IDS.clinicKL}', '${tid.t1}',
          '${klTs(wed, '10:15')}', '${klTs(wed, '11:15')}', 100, 100)`), /bookings_no_therapist_overlap/);
    });

    it('allows back-to-back bookings', async () => {
      b2 = must(await book(P2, { start: klTs(wed, '11:00'), therapist: tid.t1 }));
      assert.equal(b2.therapist_id, tid.t1);
      assert.equal(b2.auto_matched, false);
      assert.equal(b2.requested_therapist_id, tid.t1);
    });

    it('stops a patient double-booking themselves', async () => {
      const r = await book(P1, { type: 'home', service: SVC_HOME, start: klTs(wed, '10:30'), address: IDS.patient1Address, therapist: tid.t4 });
      assert.equal(errorCode(r), 'BV_PATIENT_OVERLAP');
    });

    it('rejects stale prices, short notice and unverified therapists', async () => {
      const stale = await book(P2, { start: klTs(wed, '14:00'), expected: 1 });
      assert.equal(errorCode(stale), 'BV_PRICE_CHANGED');
      const soon = await P2.attempt(
        `select * from public.create_booking($1, 'clinic', now() + interval '30 minutes', $2)`, [SVC, IDS.clinicKL]);
      assert.equal(errorCode(soon), 'BV_TOO_SOON');
      const unverified = await book(P2, { start: klTs(wed, '14:00'), therapist: tid.t5 });
      assert.equal(errorCode(unverified), 'BV_SLOT_UNAVAILABLE');
      const wrongType = await book(P2, { start: klTs(wed, '14:00'), service: SVC_HOME });
      assert.equal(errorCode(wrongType), 'BV_INVALID_SERVICE');
    });

    it('requires recorded consent before booking for a family member', async () => {
      await P1.query(`insert into public.family_members (id, primary_user_id, full_name, relationship)
                      values ('f0000000-0000-4000-8000-0000000009aa', '${IDS.patient1}', 'No Consent Yet', 'child')`);
      const r = await book(P1, { start: klTs(wed, '15:00'), family: 'f0000000-0000-4000-8000-0000000009aa' });
      assert.equal(errorCode(r), 'BV_CONSENT_REQUIRED');
      const notMine = await book(P2, { start: klTs(wed, '15:00'), family: IDS.child });
      assert.equal(errorCode(notMine), 'BV_FORBIDDEN');
      bChild = must(await book(P1, { start: klTs(wed, '15:00'), family: IDS.child, therapist: tid.t1 }));
      assert.equal(bChild.family_member_id, IDS.child);
    });

    it('prices home visits with distance and a travel fee, and reserves travel buffer', async () => {
      bHome = must(await book(P1, { type: 'home', service: SVC_HOME, start: klTs(wed, '12:30'), address: IDS.patient1Address, therapist: tid.t4 }));
      assert.equal(num(bHome.service_price), 220);
      assert.ok(num(bHome.travel_distance_km) > 3 && num(bHome.travel_distance_km) < 5);
      assert.ok(num(bHome.travel_fee) > 0);
      assert.equal(num(bHome.total_amount), num(bHome.service_price) + num(bHome.travel_fee) + num(bHome.platform_fee));
      assert.match(bHome.visit_address_text, /Jalan Demo/);
      assert.equal(bHome.buffer_minutes, 30);
      // 12:30-13:30 + 30 min buffer => 13:30 is NOT available for therapist 4 (travel time), 14:00 is.
      const near = await book(P2, { type: 'home', service: SVC_HOME, start: klTs(wed, '13:30'), address: null, therapist: tid.t4 });
      assert.ok(!near.ok);
    });
  });

  // ───────────────────────── payments ─────────────────────────
  describe('payments are only confirmed by verified server events', () => {
    it('lets a patient start a payment but never mark it paid', async () => {
      const p = await P1.one(`select * from public.initiate_payment($1, 'fpx')`, [b1.id]);
      assert.equal(p.status, 'pending');
      assert.equal(num(p.amount), 153);
      assert.equal(p.provider, 'sandbox-test');

      const upd = await P1.attempt(`update public.payments set status = 'succeeded' where id = $1`, [p.id]);
      assert.equal(upd.ok, false, 'direct update must be denied');
      const ins = await P1.attempt(
        `insert into public.payments (payer_user_id, booking_id, amount, method, status) values ($1, $2, 1, 'fpx', 'succeeded')`,
        [IDS.patient1, b1.id]);
      assert.equal(ins.ok, false, 'direct insert must be denied');
      const rpc = await P1.attempt(`select * from public.confirm_payment($1, 'fake', 153)`, [p.id]);
      assert.equal(rpc.ok, false, 'patients cannot call confirm_payment');
      const rpcAdmin = await ADMIN.attempt(`select * from public.confirm_payment($1, 'fake', 153)`, [p.id]);
      assert.equal(rpcAdmin.ok, false, 'even admins cannot bypass provider verification');
      assert.equal(await status(b1.id), 'pending');
    });

    it('rejects an amount mismatch instead of marking the booking paid', async () => {
      const p = await db.query(`select id from public.payments where booking_id = $1`, [b1.id]);
      const r = await svc.one(`select * from public.confirm_payment($1, 'prov-x', 1.00)`, [p.rows[0].id]);
      assert.equal(r.status, 'failed');
      assert.match(r.failure_reason, /Amount mismatch/);
      assert.equal(await status(b1.id), 'pending');
    });

    it('confirms a verified payment: receipt, ledger entry, status and notifications', async () => {
      const paid = await pay(P1, b1.id);
      assert.equal(paid.status, 'succeeded');
      assert.match(paid.receipt_number, /^RCT-\d{6}-\d{6}$/);
      assert.equal(await status(b1.id), 'awaiting_confirmation');

      const again = await svc.one(`select * from public.confirm_payment($1, 'prov-again', $2)`, [paid.id, paid.amount]);
      assert.equal(again.receipt_number, paid.receipt_number, 'idempotent on webhook retry');
      const tx = await db.query(`select * from public.payment_transactions where payment_id = $1 and event_type = 'payment.succeeded'`, [paid.id]);
      assert.equal(tx.rows.length, 1);
      assert.equal(tx.rows[0].signature_verified, true);

      const patientN = await P1.query(`select type from public.notifications order by created_at`);
      assert.ok(patientN.some((n) => n.type === 'payment_confirmation'));
      const therapistN = await T1.query(`select title from public.notifications`);
      assert.ok(therapistN.some((n) => n.title === 'New booking request'));
    });

    it('only the assigned therapist can respond; auto-matched bookings become "Therapist Assigned"', async () => {
      const wrong = await T3.attempt(`select * from public.therapist_respond_to_booking($1, true)`, [b1.id]);
      assert.equal(errorCode(wrong), 'BV_FORBIDDEN');
      const ok = await T1.one(`select * from public.therapist_respond_to_booking($1, true)`, [b1.id]);
      assert.equal(ok.status, 'therapist_assigned');
      const n = await P1.query(`select type from public.notifications where type = 'therapist_assignment'`);
      assert.equal(n.length, 1);
    });

    it('a patient-chosen therapist who accepts results in "Confirmed"', async () => {
      await pay(P2, b2.id);
      const ok = await T1.one(`select * from public.therapist_respond_to_booking($1, true)`, [b2.id]);
      assert.equal(ok.status, 'confirmed');
    });
  });

  // ───────────────────────── lifecycle ─────────────────────────
  describe('appointment lifecycle', () => {
    it('refuses illegal transitions and illegal actors', async () => {
      const skip = await T1.attempt(`select * from public.update_booking_status($1, 'completed')`, [b2.id]);
      assert.equal(errorCode(skip), 'BV_INVALID_TRANSITION');
      const clinicOnTheWay = await T1.attempt(`select * from public.update_booking_status($1, 'on_the_way')`, [b2.id]);
      assert.equal(errorCode(clinicOnTheWay), 'BV_INVALID_TRANSITION');
      const stranger = await T3.attempt(`select * from public.update_booking_status($1, 'arrived')`, [b2.id]);
      assert.equal(errorCode(stranger), 'BV_FORBIDDEN');
      const patient = await P2.attempt(`select * from public.update_booking_status($1, 'arrived')`, [b2.id]);
      assert.equal(errorCode(patient), 'BV_FORBIDDEN');
    });

    it('records treatment, earnings and a full status history through completion', async () => {
      await T1.query(`select * from public.update_booking_status($1, 'arrived', 'Patient checked in')`, [b1.id]);
      await T1.query(`select * from public.update_booking_status($1, 'treatment_in_progress')`, [b1.id]);
      const done = await T1.one(`select * from public.update_booking_status($1, 'completed')`, [b1.id]);
      assert.equal(done.status, 'completed');
      assert.equal(num(done.therapist_earning), 120); // (150 + 0) * (1 - 0.20)
      const session = await db.query(`select * from public.treatment_sessions where booking_id = $1`, [b1.id]);
      assert.equal(session.rows.length, 1);
      assert.ok(session.rows[0].ended_at);
      const hist = await P1.query(`select to_status, note from public.booking_status_history where booking_id = $1 order by id`, [b1.id]);
      assert.deepEqual(hist.map((h) => h.to_status),
        ['pending', 'awaiting_confirmation', 'therapist_assigned', 'arrived', 'treatment_in_progress', 'completed']);
      assert.equal(hist[3].note, 'Patient checked in');
    });

    it('supports the on-the-way flow for home visits with real live location only while travelling', async () => {
      await pay(P1, bHome.id);
      await T4.query(`select * from public.therapist_respond_to_booking($1, true)`, [bHome.id]);
      await T4.query(`select * from public.update_booking_status($1, 'on_the_way')`, [bHome.id]);

      const none = await P1.query(`select * from public.therapist_live_locations where booking_id = $1`, [bHome.id]);
      assert.equal(none.length, 0, 'no location until the therapist device reports one');

      await T4.query(`insert into public.therapist_live_locations (booking_id, therapist_id, latitude, longitude)
                      values ($1, $2, 3.14, 101.69)`, [bHome.id, tid.t4]);
      assert.equal((await P1.query(`select 1 from public.therapist_live_locations where booking_id = $1`, [bHome.id])).length, 1);
      assert.equal((await P2.query(`select 1 from public.therapist_live_locations where booking_id = $1`, [bHome.id])).length, 0);
      const spoof = await T3.attempt(`insert into public.therapist_live_locations (booking_id, therapist_id, latitude, longitude)
                                      values ($1, $2, 3.14, 101.69) on conflict (booking_id) do update set latitude = 0`, [bHome.id, tid.t3]);
      assert.equal(spoof.ok, false);

      await T4.query(`select * from public.update_booking_status($1, 'arrived')`, [bHome.id]);
      assert.equal((await db.query(`select 1 from public.therapist_live_locations where booking_id = $1`, [bHome.id])).rows.length, 0,
        'location is purged when the therapist is no longer on the way');
      const n = await P1.query(`select title from public.notifications where type = 'home_visit_update'`);
      assert.equal(n.length, 2);
    });
  });

  // ───────────────────────── reviews ─────────────────────────
  describe('reviews', () => {
    it('only allows the patient to review their own completed appointment, once', async () => {
      const notMine = await P2.attempt(`insert into public.reviews (booking_id, patient_user_id, therapist_id, rating) values ($1, $2, $3, 5)`, [b1.id, IDS.patient2, tid.t1]);
      assert.equal(notMine.ok, false);
      const notDone = await P2.attempt(`insert into public.reviews (booking_id, patient_user_id, therapist_id, rating) values ($1, $2, $3, 5)`, [b2.id, IDS.patient2, tid.t1]);
      assert.match(notDone.error.message, /BV_INVALID_REVIEW/);
      await P1.query(`insert into public.reviews (booking_id, patient_user_id, therapist_id, rating, comment) values ($1, $2, $3, 4, 'Helpful')`, [b1.id, IDS.patient1, tid.t1]);
      const dup = await P1.attempt(`insert into public.reviews (booking_id, patient_user_id, therapist_id, rating) values ($1, $2, $3, 5)`, [b1.id, IDS.patient1, tid.t1]);
      assert.equal(dup.ok, false);
      const t = await db.query(`select rating_avg, rating_count from public.therapist_profiles where id = $1`, [tid.t1]);
      assert.equal(num(t.rows[0].rating_avg), 4);
      assert.equal(t.rows[0].rating_count, 1);
    });
  });

  // ───────────────────────── cancellation / expiry / decline ─────────────────────────
  describe('cancellation, hold expiry and declines', () => {
    it('cancelling frees the slot, releases the hold and cancels unpaid payments', async () => {
      const b = must(await book(P2, { start: klTs(wed, '16:00'), therapist: tid.t1 }));
      const pend = await P2.one(`select * from public.initiate_payment($1, 'duitnow_qr')`, [b.id]);
      const cancelled = await P2.one(`select * from public.cancel_booking($1, 'Changed my mind')`, [b.id]);
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.cancellation_reason, 'Changed my mind');
      assert.equal((await db.query(`select status from public.payments where id = $1`, [pend.id])).rows[0].status, 'cancelled');
      const slots = await P2.query(`select start_at from public.get_available_times($1, 'clinic', $2::date, $3)`, [SVC, wed, IDS.clinicKL]);
      assert.ok(slots.some((s) => iso(s.start_at) === iso(klTs(wed, '16:00'))));
      const again = await P2.attempt(`select * from public.cancel_booking($1)`, [b.id]);
      assert.equal(errorCode(again), 'BV_INVALID_TRANSITION');
    });

    it('flags money already collected for a refund decision instead of keeping it silently', async () => {
      // b2 is paid + confirmed
      const c = await P2.one(`select * from public.cancel_booking($1, 'Unwell')`, [b2.id]);
      assert.equal(c.status, 'cancelled');
      const pay = await db.query(`select refund_required from public.payments where booking_id = $1`, [b2.id]);
      assert.equal(pay.rows[0].refund_required, true);
      const therapistNote = await T1.query(`select title from public.notifications where title = 'Appointment cancelled'`);
      assert.equal(therapistNote.length, 1);
    });

    it('expires unpaid holds so abandoned checkouts never block real availability', async () => {
      const b = must(await book(P1, { start: klTs(thu, '09:00'), therapist: tid.t1 }));
      await db.query(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [b.id]);
      // availability already ignores the lapsed hold ...
      const slots = await P2.query(`select start_at from public.get_available_times($1, 'clinic', $2::date, $3)`, [SVC, thu, IDS.clinicKL]);
      assert.ok(slots.some((s) => iso(s.start_at) === iso(klTs(thu, '09:00'))));
      // ... and a new booking succeeds, cancelling the stale one.
      const mine = must(await book(P2, { start: klTs(thu, '09:00'), therapist: tid.t1 }));
      assert.equal(mine.status, 'pending');
      assert.equal(await status(b.id), 'cancelled');
      await P2.query(`select * from public.cancel_booking($1)`, [mine.id]);
    });

    it('offers a declined automatic-match booking to the next therapist, then cancels if none remain', async () => {
      const b = must(await book(P1, { type: 'home', start: klTs(thu, '11:00'), address: IDS.patient1Address }));
      assert.equal(b.therapist_id, tid.t1, 'nearest therapist first');
      await pay(P1, b.id);
      const afterDecline = await T1.one(`select * from public.therapist_respond_to_booking($1, false, 'Too far')`, [b.id]);
      assert.equal(afterDecline.status, 'awaiting_confirmation');
      assert.equal(afterDecline.therapist_id, tid.t4);
      assert.deepEqual(afterDecline.declined_therapist_ids, [tid.t1]);
      assert.equal((await T4.query(`select 1 from public.notifications where title = 'New booking request'`)).length >= 2, true);

      const final = await T4.one(`select * from public.therapist_respond_to_booking($1, false)`, [b.id]);
      assert.equal(final.status, 'cancelled');
      const pay2 = await db.query(`select refund_required from public.payments where booking_id = $1`, [b.id]);
      assert.equal(pay2.rows[0].refund_required, true);
    });
  });

  // ───────────────────────── promotions & packages ─────────────────────────
  describe('promotions and packages', () => {
    it('validates promo codes server-side with per-user limits', async () => {
      const q = await P2.one(`select public.quote_booking($1, 'clinic', $2::timestamptz, $3, null, null, null, 'welcome10') as q`, [SVC, klTs(thu, '13:00'), IDS.clinicKL]);
      assert.equal(num(q.q.discount_amount), 15); // 10% of 150
      assert.equal(num(q.q.total_amount), 138);
      const bad = await P2.one(`select public.quote_booking($1, 'clinic', $2::timestamptz, $3, null, null, null, 'NOPE') as q`, [SVC, klTs(thu, '13:00'), IDS.clinicKL]);
      assert.equal(bad.q.promo_error, 'This promo code is not valid');
      assert.equal(num(bad.q.discount_amount), 0);
      const rejected = await book(P2, { start: klTs(thu, '13:00'), promo: 'NOPE' });
      assert.equal(errorCode(rejected), 'BV_INVALID_PROMO');

      const used = must(await book(P2, { start: klTs(thu, '13:00'), promo: 'WELCOME10', therapist: tid.t1 }));
      assert.equal(num(used.total_amount), 138);
      const second = await P2.one(`select public.quote_booking($1, 'clinic', $2::timestamptz, $3, null, null, null, 'WELCOME10') as q`, [SVC, klTs(thu, '14:00'), IDS.clinicKL]);
      assert.equal(second.q.promo_error, 'You have already used this promo code');
      await P2.query(`select * from public.cancel_booking($1)`, [used.id]);
      const released = await P2.one(`select public.quote_booking($1, 'clinic', $2::timestamptz, $3, null, null, null, 'WELCOME10') as q`, [SVC, klTs(thu, '14:00'), IDS.clinicKL]);
      assert.equal(released.q.promo_error, null, 'cancelling releases the promo usage');
    });

    it('activates a package only after verified payment, then redeems and restores sessions', async () => {
      const p = await P1.one(`select * from public.purchase_package($1, 'fpx')`, [IDS.pack5]);
      assert.equal(num(p.amount), 550);
      let pp = (await P1.query(`select * from public.package_purchases`))[0];
      assert.equal(pp.status, 'pending_payment');
      const early = await P1.one(`select public.quote_booking($1, 'clinic', $2::timestamptz, $3, null, null, null, null, $4) as q`,
        [SVC, klTs(thu, '14:00'), IDS.clinicKL, pp.id]);
      assert.ok(early.q.package_error, 'unpaid package cannot be used');

      await svc.one(`select * from public.confirm_payment($1, 'pkg-1', 550)`, [p.id]);
      pp = (await P1.query(`select * from public.package_purchases`))[0];
      assert.equal(pp.status, 'active');
      assert.equal(pp.sessions_remaining, 5);
      assert.ok(new Date(pp.expires_at) > new Date(Date.now() + 170 * 86400000));

      // Package covers the service price and waives the booking fee: clinic visit costs nothing more.
      const b = must(await book(P1, { start: klTs(thu, '14:00'), pkg: pp.id, therapist: tid.t1 }));
      assert.equal(num(b.total_amount), 0);
      assert.equal(b.status, 'awaiting_confirmation', 'fully prepaid bookings go straight to the therapist');
      assert.equal((await P1.query(`select sessions_remaining from public.package_purchases`))[0].sessions_remaining, 4);

      await P1.query(`select * from public.cancel_booking($1)`, [b.id]);
      assert.equal((await P1.query(`select sessions_remaining from public.package_purchases`))[0].sessions_remaining, 5);
    });

    it('sends a one-off expiry notice and expires lapsed packages', async () => {
      await db.query(`update public.package_purchases set expires_at = now() + interval '3 days'`);
      assert.equal(num((await svc.one(`select public.enqueue_package_expiry_notices() as n`)).n), 1);
      assert.equal(num((await svc.one(`select public.enqueue_package_expiry_notices() as n`)).n), 0);
      assert.equal((await P1.query(`select 1 from public.notifications where type = 'package_expiry'`)).length, 1);
      await db.query(`update public.package_purchases set expires_at = now() - interval '1 day'`);
      await svc.query(`select public.enqueue_package_expiry_notices()`);
      assert.equal((await P1.query(`select status from public.package_purchases`))[0].status, 'expired');
    });
  });

  // ───────────────────────── reminders & admin analytics ─────────────────────────
  describe('reminders and admin analytics derive from real records', () => {
    it('queues each reminder exactly once', async () => {
      await pay(P1, bChild.id);
      await T1.query(`select * from public.therapist_respond_to_booking($1, true)`, [bChild.id]);
      await db.query(`update public.bookings set scheduled_start = now() + interval '5 hours', scheduled_end = now() + interval '6 hours' where id = $1`, [bChild.id]);
      assert.equal(num((await svc.one(`select public.enqueue_appointment_reminders() as n`)).n), 1);
      assert.equal(num((await svc.one(`select public.enqueue_appointment_reminders() as n`)).n), 0);
      assert.equal((await P1.query(`select 1 from public.notifications where type = 'appointment_reminder'`)).length, 1);
      assert.equal((await T1.query(`select 1 from public.notifications where type = 'appointment_reminder'`)).length, 1);
    });

    it('computes dashboard statistics from the database, for admins only', async () => {
      const denied = await P1.attempt(`select public.admin_dashboard_stats()`);
      assert.equal(errorCode(denied), 'BV_FORBIDDEN');
      const { s } = await ADMIN.one(`select public.admin_dashboard_stats() as s`);

      const truth = (await db.query(`
        select
          (select count(*) from public.users where role = 'patient')::int as patients,
          (select count(*) from public.bookings where appointment_type = 'home' and status not in ('cancelled','pending'))::int as home,
          (select count(*) from public.bookings where appointment_type = 'clinic' and status not in ('cancelled','pending'))::int as clinic,
          (select coalesce(sum(amount - refunded_amount), 0) from public.payments where status in ('succeeded','partially_refunded'))::float8 as revenue,
          (select count(*) from public.bookings where status = 'cancelled' and coalesce(cancellation_reason,'') <> 'Payment not completed in time')::float8 as cancelled,
          (select count(*) from public.bookings where coalesce(cancellation_reason,'') <> 'Payment not completed in time')::float8 as total`)).rows[0];

      assert.equal(num(s.total_patients), truth.patients);
      assert.equal(num(s.home_bookings), truth.home);
      assert.equal(num(s.clinic_bookings), truth.clinic);
      assert.equal(num(s.revenue_total), truth.revenue);
      assert.ok(truth.revenue > 0);
      assert.equal(num(s.cancellation_rate), Math.round((1000 * truth.cancelled) / truth.total) / 10);
      assert.equal(num(s.verified_therapists), 4);
      assert.equal(num(s.pending_verification), 0);
      assert.ok(Array.isArray(s.popular_services) && s.popular_services[0].name === 'Musculoskeletal Assessment & Treatment');
      assert.equal(s.therapist_utilisation.length, 4);
    });

    it('produces a daily time series and therapist earnings summary', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await ADMIN.query(`select * from public.admin_report_timeseries(($1::date - 2), ($1::date + 70))`, [today]);
      assert.equal(rows.length, 73);
      assert.ok(rows.reduce((a, r) => a + num(r.bookings), 0) > 0);
      const e = await T1.one(`select public.therapist_earnings_summary() as e`);
      assert.equal(num(e.e.completed_sessions), 1);
      assert.equal(num(e.e.total_earned), 120);
      const forbidden = await P1.attempt(`select public.therapist_earnings_summary()`);
      assert.equal(errorCode(forbidden), 'BV_FORBIDDEN');
    });

    it('lets admins reassign a therapist only to someone genuinely available', async () => {
      const b = must(await book(P2, { start: klTs(thu, '15:00'), therapist: tid.t1 }));
      await pay(P2, b.id);
      const busy = await ADMIN.attempt(`select * from public.admin_assign_therapist($1, $2)`, [b.id, tid.t3]);
      assert.equal(errorCode(busy), 'BV_SLOT_UNAVAILABLE', 'therapist 3 does not offer this service/clinic');
      const notAdmin = await T1.attempt(`select * from public.admin_assign_therapist($1, $2)`, [b.id, tid.t3]);
      assert.equal(errorCode(notAdmin), 'BV_FORBIDDEN');
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMalaysianPhone,
  registerSchema,
  passwordSchema,
  addressSchema,
  availabilityWindowSchema,
  friendlyError,
  formatMYR,
  formatTime,
  formatDuration,
  addDaysToDateString,
  isoWeekday,
  nextStatusesFor,
  initials,
  ageFromDob,
  BOOKING_STATUS_META,
  BOOKING_STATUSES,
} from '../../packages/shared/src/index';

describe('@bevital/shared', () => {
  it('normalises Malaysian phone numbers', () => {
    assert.equal(normalizeMalaysianPhone('012-345 6789'), '+60123456789');
    assert.equal(normalizeMalaysianPhone('0123456789'), '+60123456789');
    assert.equal(normalizeMalaysianPhone('+60123456789'), '+60123456789');
    assert.equal(normalizeMalaysianPhone('60123456789'), '+60123456789');
    assert.equal(normalizeMalaysianPhone('011-2345 6789'), '+601123456789');
    assert.equal(normalizeMalaysianPhone('03-1234 5678'), '+60312345678');
    assert.equal(normalizeMalaysianPhone('+6591234567'), null);
    assert.equal(normalizeMalaysianPhone('12345'), null);
    assert.equal(normalizeMalaysianPhone(''), null);
  });

  it('enforces the password policy used by Supabase auth', () => {
    assert.ok(!passwordSchema.safeParse('short1A').success);
    assert.ok(!passwordSchema.safeParse('alllowercase123').success);
    assert.ok(!passwordSchema.safeParse('NoDigitsHereAtAll').success);
    assert.ok(passwordSchema.safeParse('GoodPassw0rdHere').success);
  });

  it('validates registration, including required consent', () => {
    const base = {
      fullName: 'Aisha Rahman', email: 'AISHA@Example.com', phone: '012-345 6789',
      password: 'GoodPassw0rdHere', confirmPassword: 'GoodPassw0rdHere', role: 'patient' as const,
      acceptTerms: true as const, acceptPdpa: true as const,
    };
    const ok = registerSchema.safeParse(base);
    assert.ok(ok.success);
    assert.equal(ok.data.email, 'aisha@example.com');
    assert.equal(ok.data.phone, '+60123456789');
    assert.ok(!registerSchema.safeParse({ ...base, acceptPdpa: false }).success);
    assert.ok(!registerSchema.safeParse({ ...base, confirmPassword: 'different' }).success);
    assert.ok(!registerSchema.safeParse({ ...base, role: 'admin' }).success, 'admin can never be self-selected');
  });

  it('validates addresses and availability windows', () => {
    assert.ok(addressSchema.safeParse({ label: 'Home', line1: '10 Jalan Demo', city: 'KL', state: 'Selangor', postcode: '50450', latitude: 3.1, longitude: 101.7, isDefault: false }).success);
    assert.ok(!addressSchema.safeParse({ line1: '10 Jalan Demo', city: 'KL', state: 'Selangor', postcode: '5045', latitude: 3.1, longitude: 101.7 }).success);
    assert.ok(!availabilityWindowSchema.safeParse({ dayOfWeek: 1, startTime: '17:00', endTime: '09:00', locationType: 'both' }).success);
    assert.ok(availabilityWindowSchema.safeParse({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', locationType: 'both' }).success);
  });

  it('formats money, durations and Malaysian dates', () => {
    assert.equal(formatMYR(1234.5), 'RM 1,234.50');
    assert.equal(formatMYR('153'), 'RM 153.00');
    assert.equal(formatDuration(45), '45 min');
    assert.equal(formatDuration(90), '1 hr 30 min');
    // 02:00 UTC is 10:00 in Kuala Lumpur
    assert.equal(formatTime('2026-12-02T02:00:00Z'), '10:00 AM');
    assert.equal(addDaysToDateString('2026-12-31', 1), '2027-01-01');
    assert.equal(isoWeekday('2026-12-02'), 3);
    assert.equal(initials('Demo Physio Aisha'), 'DP');
    assert.equal(ageFromDob('2000-06-15', new Date('2026-06-14T00:00:00Z')), 25);
  });

  it('maps database error codes to friendly messages', () => {
    assert.match(friendlyError({ message: 'BV_SLOT_UNAVAILABLE: that time is no longer available' }), /no longer available/);
    assert.match(friendlyError({ message: 'Invalid login credentials' }), /Incorrect email or password/);
    assert.match(friendlyError(new Error('BV_TOO_SOON: appointments need at least 120 minutes notice')), /too soon/);
  });

  it('exposes status metadata for every status and role-aware next steps', () => {
    for (const s of BOOKING_STATUSES) assert.ok(BOOKING_STATUS_META[s].label);
    assert.deepEqual(nextStatusesFor('confirmed', 'therapist', 'home').sort(), ['arrived', 'cancelled', 'on_the_way']);
    assert.deepEqual(nextStatusesFor('confirmed', 'therapist', 'clinic').sort(), ['arrived', 'cancelled']);
    assert.deepEqual(nextStatusesFor('pending', 'therapist', 'clinic'), []);
    assert.deepEqual(nextStatusesFor('completed', 'admin', 'clinic'), []);
  });
});

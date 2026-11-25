/**
 * Enumerations that mirror the Postgres enums in supabase/migrations.
 * A database test (tests/db/schema.test.mjs) asserts these stay in sync.
 */

export const USER_ROLES = ['patient', 'therapist', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const APPOINTMENT_TYPES = ['clinic', 'home'] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  clinic: 'Clinic physiotherapy',
  home: 'Home physiotherapy',
};

// ───────────────────────── Booking status ─────────────────────────

export const BOOKING_STATUSES = [
  'pending',
  'awaiting_confirmation',
  'confirmed',
  'therapist_assigned',
  'on_the_way',
  'arrived',
  'treatment_in_progress',
  'completed',
  'cancelled',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type StatusTone = 'warning' | 'info' | 'primary' | 'success' | 'danger' | 'neutral';

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; patientHint: string; tone: StatusTone; active: boolean }
> = {
  pending: {
    label: 'Pending',
    patientHint: 'Complete payment to secure your slot.',
    tone: 'warning',
    active: true,
  },
  awaiting_confirmation: {
    label: 'Awaiting Confirmation',
    patientHint: 'Your physiotherapist is reviewing your request.',
    tone: 'warning',
    active: true,
  },
  confirmed: {
    label: 'Confirmed',
    patientHint: 'Your appointment is confirmed.',
    tone: 'info',
    active: true,
  },
  therapist_assigned: {
    label: 'Therapist Assigned',
    patientHint: 'A physiotherapist has been assigned to your appointment.',
    tone: 'info',
    active: true,
  },
  on_the_way: {
    label: 'On The Way',
    patientHint: 'Your physiotherapist is on the way.',
    tone: 'primary',
    active: true,
  },
  arrived: {
    label: 'Arrived',
    patientHint: 'Your physiotherapist has arrived.',
    tone: 'primary',
    active: true,
  },
  treatment_in_progress: {
    label: 'Treatment In Progress',
    patientHint: 'Your treatment session is under way.',
    tone: 'primary',
    active: true,
  },
  completed: {
    label: 'Completed',
    patientHint: 'Session completed. Review your recovery plan.',
    tone: 'success',
    active: false,
  },
  cancelled: {
    label: 'Cancelled',
    patientHint: 'This appointment was cancelled.',
    tone: 'danger',
    active: false,
  },
};

/**
 * Allowed status transitions per actor. Mirrors the `booking_status_transitions`
 * table in the database (which is the source of truth and what the RPCs enforce).
 * The UI uses this only to decide which action buttons to show.
 */
export type TransitionRule = {
  from: BookingStatus;
  to: BookingStatus;
  roles: UserRole[];
  homeOnly?: boolean;
};

export const BOOKING_TRANSITIONS: TransitionRule[] = [
  // pending → awaiting_confirmation is system-only (verified payment) and has no role entry.
  { from: 'pending', to: 'cancelled', roles: ['patient', 'admin'] },
  { from: 'awaiting_confirmation', to: 'confirmed', roles: ['therapist', 'admin'] },
  { from: 'awaiting_confirmation', to: 'therapist_assigned', roles: ['therapist', 'admin'] },
  { from: 'awaiting_confirmation', to: 'cancelled', roles: ['patient', 'therapist', 'admin'] },
  { from: 'confirmed', to: 'therapist_assigned', roles: ['admin'] },
  { from: 'confirmed', to: 'on_the_way', roles: ['therapist', 'admin'], homeOnly: true },
  { from: 'confirmed', to: 'arrived', roles: ['therapist', 'admin'] },
  { from: 'confirmed', to: 'cancelled', roles: ['patient', 'therapist', 'admin'] },
  { from: 'therapist_assigned', to: 'on_the_way', roles: ['therapist', 'admin'], homeOnly: true },
  { from: 'therapist_assigned', to: 'arrived', roles: ['therapist', 'admin'] },
  { from: 'therapist_assigned', to: 'cancelled', roles: ['patient', 'therapist', 'admin'] },
  { from: 'on_the_way', to: 'arrived', roles: ['therapist', 'admin'] },
  { from: 'on_the_way', to: 'cancelled', roles: ['therapist', 'admin'] },
  { from: 'arrived', to: 'treatment_in_progress', roles: ['therapist', 'admin'] },
  { from: 'arrived', to: 'cancelled', roles: ['admin'] },
  { from: 'treatment_in_progress', to: 'completed', roles: ['therapist', 'admin'] },
];

export function nextStatusesFor(
  from: BookingStatus,
  role: UserRole,
  appointmentType: AppointmentType,
): BookingStatus[] {
  return BOOKING_TRANSITIONS.filter(
    (t) =>
      t.from === from &&
      t.roles.includes(role) &&
      (!t.homeOnly || appointmentType === 'home'),
  ).map((t) => t.to);
}

// ───────────────────────── Other enums ─────────────────────────

export const VERIFICATION_STATUSES = [
  'pending',
  'under_review',
  'verified',
  'rejected',
  'suspended',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  pending: 'Pending submission',
  under_review: 'Under review',
  verified: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export const CREDENTIAL_STATUSES = ['submitted', 'approved', 'rejected', 'expired'] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const CREDENTIAL_TYPES = [
  'degree',
  'mahpc_registration',
  'annual_practising_certificate',
  'professional_indemnity',
  'identity',
  'other',
] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  degree: 'Physiotherapy degree / diploma',
  mahpc_registration: 'Allied health council registration',
  annual_practising_certificate: 'Annual practising certificate (APC)',
  professional_indemnity: 'Professional indemnity insurance',
  identity: 'Identity document',
  other: 'Other',
};

export const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  'fpx',
  'duitnow_qr',
  'credit_card',
  'debit_card',
  'ewallet',
  'package_credit',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  fpx: 'FPX Online Banking',
  duitnow_qr: 'DuitNow QR',
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  ewallet: 'E-wallet',
  package_credit: 'Package credit',
};

export const RECORD_TYPES = [
  'medical_history',
  'condition',
  'injury',
  'allergy',
  'surgery',
  'medication',
  'symptom',
  'document',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  medical_history: 'Medical history',
  condition: 'Existing conditions',
  injury: 'Previous injuries',
  allergy: 'Allergies',
  surgery: 'Previous surgeries',
  medication: 'Current medication',
  symptom: 'Current symptoms',
  document: 'Medical documents',
};

export const RELATIONSHIPS = ['child', 'parent', 'spouse', 'sibling', 'grandparent', 'other'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const CONSENT_BASES = ['guardian_of_minor', 'authorised_representative', 'adult_consented'] as const;
export type ConsentBasis = (typeof CONSENT_BASES)[number];

export const NOTIFICATION_TYPES = [
  'booking_confirmation',
  'appointment_reminder',
  'payment_confirmation',
  'therapist_assignment',
  'home_visit_update',
  'exercise_reminder',
  'package_expiry',
  'promotion',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const SERVICE_CATEGORY_SLUGS = [
  'musculoskeletal',
  'spine-posture',
  'sports-injury',
  'post-operative',
  'neurological',
  'manual-therapy',
  'exercise-therapy',
  'electrotherapy',
] as const;

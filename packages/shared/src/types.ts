/**
 * Row types for the tables/RPCs the apps use. Hand-maintained to match supabase/migrations.
 * (Once a local Supabase stack is running you can replace these with `supabase gen types`.)
 */
import type {
  AppointmentType,
  BookingStatus,
  ConsentBasis,
  CredentialStatus,
  CredentialType,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  RecordType,
  Relationship,
  UserRole,
  VerificationStatus,
} from './enums';

export type UUID = string;
export type ISODateTime = string;
export type ISODate = string;

export interface UserRow {
  id: UUID;
  role: UserRole;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  preferred_language: 'en' | 'ms' | 'zh' | 'ta';
  is_active: boolean;
  created_at: ISODateTime;
}

export interface PatientProfileRow {
  user_id: UUID;
  date_of_birth: ISODate | null;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  occupation: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
}

export interface FamilyMemberRow {
  id: UUID;
  primary_user_id: UUID;
  full_name: string;
  relationship: Relationship;
  date_of_birth: ISODate | null;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  phone: string | null;
  consent_basis: ConsentBasis | null;
  consent_granted_at: ISODateTime | null;
  is_active: boolean;
}

export interface AddressRow {
  id: UUID;
  user_id: UUID;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postcode: string;
  country: string;
  latitude: number;
  longitude: number;
  place_id: string | null;
  access_notes: string | null;
  is_default: boolean;
}

export interface ClinicRow {
  id: UUID;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  opening_hours: Record<string, string>;
  is_active: boolean;
}

export interface ServiceCategoryRow {
  id: UUID;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ServiceRow {
  id: UUID;
  category_id: UUID;
  slug: string;
  name: string;
  description: string;
  conditions_treated: string[];
  treatment_objectives: string[];
  duration_minutes: number;
  supports_clinic: boolean;
  supports_home: boolean;
  price_clinic: number | null;
  price_home: number | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface TherapistProfileRow {
  id: UUID;
  user_id: UUID;
  display_name: string;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  qualifications: string[];
  languages: string[];
  clinic_id: UUID | null;
  offers_clinic_visits: boolean;
  offers_home_visits: boolean;
  service_radius_km: number;
  is_accepting_bookings: boolean;
  verification_status: VerificationStatus;
  verified_at: ISODateTime | null;
  rating_avg: number;
  rating_count: number;
}

export interface TherapistCredentialRow {
  id: UUID;
  therapist_id: UUID;
  credential_type: CredentialType;
  title: string;
  issuer: string | null;
  credential_number: string | null;
  issued_on: ISODate | null;
  expires_on: ISODate | null;
  document_path: string | null;
  status: CredentialStatus;
  review_notes: string | null;
  reviewed_at: ISODateTime | null;
}

export interface AvailabilityRow {
  id: UUID;
  therapist_id: UUID;
  day_of_week: number; // 1 = Monday ... 7 = Sunday
  start_time: string; // 'HH:MM:SS'
  end_time: string;
  location_type: 'clinic' | 'home' | 'both';
}

export interface BookingRow {
  id: UUID;
  reference: string;
  patient_user_id: UUID;
  family_member_id: UUID | null;
  service_id: UUID;
  appointment_type: AppointmentType;
  clinic_id: UUID | null;
  address_id: UUID | null;
  visit_address_text: string | null;
  visit_latitude: number | null;
  visit_longitude: number | null;
  visit_notes: string | null;
  therapist_id: UUID | null;
  requested_therapist_id: UUID | null;
  auto_matched: boolean;
  scheduled_start: ISODateTime;
  scheduled_end: ISODateTime;
  status: BookingStatus;
  hold_expires_at: ISODateTime | null;
  service_price: number;
  travel_distance_km: number | null;
  travel_fee: number;
  platform_fee: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  promotion_id: UUID | null;
  package_purchase_id: UUID | null;
  therapist_earning: number | null;
  patient_notes: string | null;
  symptoms: string | null;
  share_records_consent: boolean;
  cancellation_reason: string | null;
  created_at: ISODateTime;
}

export interface BookingStatusHistoryRow {
  id: number;
  booking_id: UUID;
  from_status: BookingStatus | null;
  to_status: BookingStatus;
  note: string | null;
  created_at: ISODateTime;
}

export interface PaymentRow {
  id: UUID;
  payer_user_id: UUID;
  booking_id: UUID | null;
  package_purchase_id: UUID | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  provider_reference: string | null;
  checkout_url: string | null;
  paid_at: ISODateTime | null;
  failure_reason: string | null;
  refunded_amount: number;
  refund_required: boolean;
  receipt_number: string | null;
  created_at: ISODateTime;
}

export interface PackageRow {
  id: UUID;
  name: string;
  description: string | null;
  service_id: UUID | null;
  session_count: number;
  price: number;
  validity_days: number;
  is_active: boolean;
}

export interface PackagePurchaseRow {
  id: UUID;
  package_id: UUID;
  user_id: UUID;
  sessions_total: number;
  sessions_remaining: number;
  status: 'pending_payment' | 'active' | 'exhausted' | 'expired' | 'refunded';
  purchased_at: ISODateTime | null;
  expires_at: ISODateTime | null;
}

export interface PromotionRow {
  id: UUID;
  code: string;
  title: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_discount: number | null;
  min_spend: number;
  valid_from: ISODateTime;
  valid_until: ISODateTime | null;
  usage_limit: number | null;
  per_user_limit: number;
  is_featured: boolean;
  is_active: boolean;
}

export interface MedicalRecordRow {
  id: UUID;
  patient_user_id: UUID;
  family_member_id: UUID | null;
  record_type: RecordType;
  title: string;
  description: string | null;
  onset_date: ISODate | null;
  severity: 'mild' | 'moderate' | 'severe' | null;
  is_active: boolean;
  document_path: string | null;
  created_at: ISODateTime;
}

export interface TreatmentSessionRow {
  id: UUID;
  booking_id: UUID;
  therapist_id: UUID;
  patient_user_id: UUID;
  family_member_id: UUID | null;
  started_at: ISODateTime;
  ended_at: ISODateTime | null;
  pain_score_before: number | null;
  pain_score_after: number | null;
  patient_summary: string | null;
}

export interface ClinicalNoteRow {
  id: UUID;
  booking_id: UUID;
  therapist_id: UUID;
  patient_user_id: UUID;
  family_member_id: UUID | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  patient_summary: string | null;
  share_with_patient: boolean;
  created_at: ISODateTime;
}

export interface RehabGoalRow {
  id: UUID;
  patient_user_id: UUID;
  family_member_id: UUID | null;
  therapist_id: UUID;
  title: string;
  description: string | null;
  target_date: ISODate | null;
  status: 'active' | 'achieved' | 'paused' | 'cancelled';
  progress_percent: number;
}

export interface ExerciseProgrammeRow {
  id: UUID;
  patient_user_id: UUID;
  family_member_id: UUID | null;
  therapist_id: UUID;
  title: string;
  description: string | null;
  start_date: ISODate;
  end_date: ISODate | null;
  frequency_per_week: number;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
}

export interface ExerciseItemRow {
  id: UUID;
  programme_id: UUID;
  name: string;
  instructions: string | null;
  sets: number | null;
  reps: number | null;
  hold_seconds: number | null;
  video_url: string | null;
  sort_order: number;
}

export interface ExerciseCompletionRow {
  id: UUID;
  programme_item_id: UUID;
  patient_user_id: UUID;
  completed_on: ISODate;
  completed_at: ISODateTime;
  pain_level: number | null;
  notes: string | null;
}

export interface ReviewRow {
  id: UUID;
  booking_id: UUID;
  patient_user_id: UUID;
  therapist_id: UUID;
  rating: number;
  comment: string | null;
  is_published: boolean;
  created_at: ISODateTime;
}

export interface NotificationRow {
  id: UUID;
  user_id: UUID;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface EducationArticleRow {
  id: UUID;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: string | null;
  reading_minutes: number;
  is_published: boolean;
}

export interface SystemSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  is_public: boolean;
}

export interface AuditLogRow {
  id: number;
  actor_user_id: UUID | null;
  actor_role: UserRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: ISODateTime;
}

// ───────────────────────── RPC results ─────────────────────────

export interface AvailableTime {
  start_at: ISODateTime;
  end_at: ISODateTime;
  therapist_count: number;
}

export interface AvailableTherapist {
  therapist_id: UUID;
  display_name: string;
  avatar_url: string | null;
  headline: string | null;
  years_experience: number | null;
  languages: string[];
  rating_avg: number;
  rating_count: number;
  distance_km: number | null;
  travel_fee: number;
  service_price: number;
}

export interface BookingQuote {
  currency: string;
  duration_minutes: number;
  service_price: number;
  travel_distance_km: number | null;
  travel_fee: number;
  platform_fee: number;
  discount_amount: number;
  total_amount: number;
  promotion_id: UUID | null;
  promo_error: string | null;
  package_purchase_id: UUID | null;
  package_error: string | null;
  payment_required: boolean;
  therapist_id: UUID;
}

export interface PatientHealthView {
  patient: {
    name: string;
    date_of_birth: ISODate | null;
    gender: string | null;
    relationship: Relationship | null;
    booked_by: string;
    phone: string | null;
  };
  emergency_contact: { name: string | null; phone: string | null; relationship: string | null };
  records: Array<
    Pick<MedicalRecordRow, 'id' | 'record_type' | 'title' | 'description' | 'onset_date' | 'severity' | 'document_path'>
  >;
}

export interface TherapistEarningsSummary {
  completed_sessions: number;
  total_earned: number;
  this_month: number;
  upcoming_sessions: number;
  upcoming_estimate: number;
  by_month: Array<{ month: string; earned: number; sessions: number }>;
}

export interface AdminDashboardStats {
  total_patients: number;
  active_patients: number;
  total_therapists: number;
  verified_therapists: number;
  pending_verification: number;
  appointments_today: number;
  appointments_month: number;
  revenue_total: number;
  revenue_month: number;
  popular_services: Array<{ service_id: UUID; name: string; bookings: number }>;
  cancellation_rate: number;
  clinic_bookings: number;
  home_bookings: number;
  therapist_utilisation: Array<{
    therapist_id: UUID;
    name: string;
    booked_minutes: number;
    available_minutes: number;
    utilisation_pct: number;
  }>;
}

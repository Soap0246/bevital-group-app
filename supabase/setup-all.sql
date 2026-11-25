-- ===== supabase/migrations/20260115000001_extensions_and_enums.sql =====
-- ============================================================================
-- BeVital — migration 1: extensions and enumerations
-- ============================================================================
-- Conventions
--   * All timestamps are timestamptz (stored UTC). Business hours are interpreted
--     in Asia/Kuala_Lumpur (see system_settings.timezone).
--   * Money is numeric(10,2) in MYR.
--   * Every table has RLS enabled in migration 6; nothing is readable by default.
-- ============================================================================

create schema if not exists extensions;
-- btree_gist lets us build exclusion constraints mixing equality (therapist) and
-- range overlap (time slot): the database itself prevents double booking.
create extension if not exists btree_gist with schema extensions;

create type public.user_role as enum ('patient', 'therapist', 'admin');
create type public.appointment_type as enum ('clinic', 'home');

create type public.booking_status as enum (
  'pending',
  'awaiting_confirmation',
  'confirmed',
  'therapist_assigned',
  'on_the_way',
  'arrived',
  'treatment_in_progress',
  'completed',
  'cancelled'
);

create type public.verification_status as enum ('pending', 'under_review', 'verified', 'rejected', 'suspended');
create type public.credential_status as enum ('submitted', 'approved', 'rejected', 'expired');
create type public.credential_type as enum (
  'degree',
  'mahpc_registration',
  'annual_practising_certificate',
  'professional_indemnity',
  'identity',
  'other'
);

create type public.payment_status as enum (
  'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'
);
create type public.payment_method as enum (
  'fpx', 'duitnow_qr', 'credit_card', 'debit_card', 'ewallet', 'package_credit'
);

create type public.record_type as enum (
  'medical_history', 'condition', 'injury', 'allergy', 'surgery', 'medication', 'symptom', 'document'
);
create type public.relationship_type as enum ('child', 'parent', 'spouse', 'sibling', 'grandparent', 'other');
create type public.consent_basis as enum ('guardian_of_minor', 'authorised_representative', 'adult_consented');

create type public.consent_type as enum (
  'terms_of_service',
  'privacy_pdpa',
  'health_data_processing',
  'family_proxy',
  'therapist_record_access',
  'marketing'
);

create type public.notification_type as enum (
  'booking_confirmation',
  'appointment_reminder',
  'payment_confirmation',
  'therapist_assignment',
  'home_visit_update',
  'exercise_reminder',
  'package_expiry',
  'promotion',
  'system'
);

create type public.discount_type as enum ('percent', 'fixed');
create type public.goal_status as enum ('active', 'achieved', 'paused', 'cancelled');
create type public.package_purchase_status as enum ('pending_payment', 'active', 'exhausted', 'expired', 'refunded');
create type public.programme_status as enum ('active', 'completed', 'paused', 'cancelled');

-- ===== supabase/migrations/20260115000002_core_schema.sql =====
-- ============================================================================
-- BeVital — migration 2: identity, catalogue and therapist tables
-- ============================================================================

-- Shared trigger function: keep updated_at fresh.
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── Identity ─────────────────────────
-- public.users extends auth.users (1:1). Roles are assigned by the signup trigger
-- (patient/therapist only) or by an admin. Users can never grant themselves a role.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'patient',
  full_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'ms', 'zh', 'ta')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')
);
create index users_role_idx on public.users (role);
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

create table public.patient_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  date_of_birth date check (date_of_birth is null or date_of_birth <= current_date),
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  occupation text,
  emergency_contact_name text,
  emergency_contact_phone text check (emergency_contact_phone is null or emergency_contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  emergency_contact_relationship text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger patient_profiles_updated_at before update on public.patient_profiles
  for each row execute function public.set_updated_at();

-- Family members are people the account holder books for (children, parents, ...).
-- Consent must be recorded before the profile can be booked for.
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null references public.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  relationship public.relationship_type not null,
  date_of_birth date check (date_of_birth is null or date_of_birth <= current_date),
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  consent_basis public.consent_basis,
  consent_granted_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_consent_pair check ((consent_basis is null) = (consent_granted_at is null))
);
create index family_members_primary_idx on public.family_members (primary_user_id);
create trigger family_members_updated_at before update on public.family_members
  for each row execute function public.set_updated_at();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  label text not null default 'Home',
  line1 text not null check (length(trim(line1)) > 0),
  line2 text,
  city text not null,
  state text not null,
  postcode text not null check (postcode ~ '^[0-9]{5}$'),
  country text not null default 'MY',
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  place_id text,
  access_notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default_per_user on public.addresses (user_id) where is_default;
create trigger addresses_updated_at before update on public.addresses
  for each row execute function public.set_updated_at();

-- ───────────────────────── Platform configuration ─────────────────────────
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger system_settings_updated_at before update on public.system_settings
  for each row execute function public.set_updated_at();

-- ───────────────────────── Clinics ─────────────────────────
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postcode text not null check (postcode ~ '^[0-9]{5}$'),
  country text not null default 'MY',
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  phone text,
  email text,
  opening_hours jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clinics_updated_at before update on public.clinics
  for each row execute function public.set_updated_at();

-- ───────────────────────── Service catalogue ─────────────────────────
-- service_lines is the extension point for future disciplines (occupational
-- therapy, speech therapy, dietetics, nursing ...). Only 'physiotherapy' is
-- active in release 1; adding a line later is data, not a rebuild.
create table public.service_lines (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  provider_title text not null default 'Physiotherapist',
  is_active boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  service_line_id uuid not null references public.service_lines (id),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index service_categories_line_idx on public.service_categories (service_line_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id),
  slug text not null unique,
  name text not null,
  description text not null,
  conditions_treated text[] not null default '{}',
  treatment_objectives text[] not null default '{}',
  duration_minutes int not null check (duration_minutes between 15 and 240),
  supports_clinic boolean not null default true,
  supports_home boolean not null default true,
  price_clinic numeric(10, 2) check (price_clinic is null or price_clinic >= 0),
  price_home numeric(10, 2) check (price_home is null or price_home >= 0),
  image_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_some_location check (supports_clinic or supports_home),
  constraint services_clinic_price check (not supports_clinic or price_clinic is not null),
  constraint services_home_price check (not supports_home or price_home is not null)
);
create index services_category_idx on public.services (category_id);
create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

-- ───────────────────────── Therapists ─────────────────────────
create table public.therapist_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  service_line_id uuid references public.service_lines (id),
  -- Denormalised public display fields (kept in sync by trigger) so patients never
  -- need read access to public.users to see who their therapist is.
  display_name text not null default '',
  avatar_url text,
  headline text,
  bio text,
  years_experience int check (years_experience is null or years_experience between 0 and 70),
  qualifications text[] not null default '{}',
  languages text[] not null default '{}',
  clinic_id uuid references public.clinics (id),
  offers_clinic_visits boolean not null default true,
  offers_home_visits boolean not null default false,
  service_radius_km numeric(5, 1) not null default 15 check (service_radius_km between 0 and 100),
  is_accepting_bookings boolean not null default true,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references public.users (id),
  rating_avg numeric(3, 2) not null default 0 check (rating_avg between 0 and 5),
  rating_count int not null default 0 check (rating_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index therapist_profiles_status_idx on public.therapist_profiles (verification_status);
create index therapist_profiles_clinic_idx on public.therapist_profiles (clinic_id);
create trigger therapist_profiles_updated_at before update on public.therapist_profiles
  for each row execute function public.set_updated_at();

-- Private therapist data (home base used for distance calculations is a home
-- address, so it is never exposed to patients).
create table public.therapist_private (
  therapist_id uuid primary key references public.therapist_profiles (id) on delete cascade,
  base_latitude numeric(9, 6) check (base_latitude between -90 and 90),
  base_longitude numeric(9, 6) check (base_longitude between -180 and 180),
  updated_at timestamptz not null default now()
);

create table public.therapist_services (
  therapist_id uuid not null references public.therapist_profiles (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (therapist_id, service_id)
);
create index therapist_services_service_idx on public.therapist_services (service_id);

create table public.therapist_credentials (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapist_profiles (id) on delete cascade,
  credential_type public.credential_type not null,
  title text not null,
  issuer text,
  credential_number text,
  issued_on date,
  expires_on date,
  -- Path inside the private 'therapist-credentials' bucket: {user_id}/{file}
  document_path text,
  status public.credential_status not null default 'submitted',
  review_notes text,
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credential_dates check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
create index therapist_credentials_therapist_idx on public.therapist_credentials (therapist_id);
create trigger therapist_credentials_updated_at before update on public.therapist_credentials
  for each row execute function public.set_updated_at();

-- Weekly recurring working hours. day_of_week follows ISO-8601 (1 = Monday ... 7 = Sunday).
create table public.therapist_availability (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapist_profiles (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  location_type text not null default 'both' check (location_type in ('clinic', 'home', 'both')),
  created_at timestamptz not null default now(),
  constraint availability_order check (end_time > start_time)
);
create index therapist_availability_lookup_idx on public.therapist_availability (therapist_id, day_of_week);

create table public.therapist_time_off (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapist_profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint time_off_order check (ends_at > starts_at)
);
create index therapist_time_off_lookup_idx on public.therapist_time_off (therapist_id, starts_at, ends_at);

-- ───────────────────────── Marketing / commerce reference ─────────────────────────
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,24}$'),
  title text not null,
  description text,
  discount_type public.discount_type not null,
  discount_value numeric(10, 2) not null check (discount_value > 0),
  max_discount numeric(10, 2) check (max_discount is null or max_discount > 0),
  min_spend numeric(10, 2) not null default 0 check (min_spend >= 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  usage_limit int check (usage_limit is null or usage_limit > 0),
  per_user_limit int not null default 1 check (per_user_limit > 0),
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_percent_range check (discount_type <> 'percent' or discount_value <= 100),
  constraint promo_window check (valid_until is null or valid_until > valid_from)
);
create trigger promotions_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- null service_id = redeemable against any physiotherapy service
  service_id uuid references public.services (id),
  session_count int not null check (session_count between 2 and 60),
  price numeric(10, 2) not null check (price >= 0),
  validity_days int not null default 180 check (validity_days between 7 and 730),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger packages_updated_at before update on public.packages
  for each row execute function public.set_updated_at();

create table public.education_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null,
  body text not null,
  category text,
  image_url text,
  reading_minutes int not null default 3,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger education_articles_updated_at before update on public.education_articles
  for each row execute function public.set_updated_at();

-- ───────────────────────── Consent & audit ─────────────────────────
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  family_member_id uuid references public.family_members (id) on delete cascade,
  consent_type public.consent_type not null,
  policy_version text not null default '1.0',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index consents_user_idx on public.consents (user_id, consent_type);

-- Append-only. Written by triggers / SECURITY DEFINER functions only.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  actor_role public.user_role,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- ===== supabase/migrations/20260115000003_bookings_payments_clinical.sql =====
-- ============================================================================
-- BeVital — migration 3: bookings, payments, packages, clinical, notifications
-- ============================================================================

-- ───────────────────────── Package purchases (before bookings: FK target) ─────────────────────────
create table public.package_purchases (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id),
  user_id uuid not null references public.users (id),
  sessions_total int not null check (sessions_total > 0),
  sessions_remaining int not null check (sessions_remaining >= 0),
  status public.package_purchase_status not null default 'pending_payment',
  purchased_at timestamptz,
  expires_at timestamptz,
  expiry_notice_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint package_balance check (sessions_remaining <= sessions_total)
);
create index package_purchases_user_idx on public.package_purchases (user_id, status);
create trigger package_purchases_updated_at before update on public.package_purchases
  for each row execute function public.set_updated_at();

-- ───────────────────────── Bookings ─────────────────────────
create sequence public.booking_reference_seq start 1000;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('BV-' || lpad(nextval('public.booking_reference_seq')::text, 6, '0')),
  patient_user_id uuid not null references public.users (id),
  family_member_id uuid references public.family_members (id),
  service_id uuid not null references public.services (id),
  appointment_type public.appointment_type not null,
  clinic_id uuid references public.clinics (id),
  address_id uuid references public.addresses (id) on delete set null,
  -- Snapshot of the visit location at booking time (addresses can later be edited/deleted).
  visit_address_text text,
  visit_latitude numeric(9, 6),
  visit_longitude numeric(9, 6),
  visit_notes text,
  therapist_id uuid references public.therapist_profiles (id),
  requested_therapist_id uuid references public.therapist_profiles (id),
  auto_matched boolean not null default false,
  declined_therapist_ids uuid[] not null default '{}',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  -- Travel/cleanup buffer after the session. slot_range = [start, end + buffer).
  buffer_minutes int not null default 0 check (buffer_minutes >= 0),
  slot_range tstzrange not null,
  status public.booking_status not null default 'pending',
  hold_expires_at timestamptz,
  -- Pricing (always calculated server-side in create_booking)
  service_price numeric(10, 2) not null check (service_price >= 0),
  travel_distance_km numeric(6, 2) check (travel_distance_km is null or travel_distance_km >= 0),
  travel_fee numeric(10, 2) not null default 0 check (travel_fee >= 0),
  platform_fee numeric(10, 2) not null default 0 check (platform_fee >= 0),
  discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  currency char(3) not null default 'MYR',
  promotion_id uuid references public.promotions (id),
  package_purchase_id uuid references public.package_purchases (id),
  therapist_earning numeric(10, 2) check (therapist_earning is null or therapist_earning >= 0),
  patient_notes text,
  symptoms text,
  share_records_consent boolean not null default false,
  late_cancellation boolean not null default false,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users (id),
  cancellation_reason text,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_time_order check (scheduled_end > scheduled_start),
  constraint booking_clinic_location check (appointment_type <> 'clinic' or clinic_id is not null),
  constraint booking_home_location check (
    appointment_type <> 'home' or (visit_latitude is not null and visit_longitude is not null and visit_address_text is not null)
  ),
  constraint booking_total_consistent check (
    total_amount = service_price + travel_fee + platform_fee - discount_amount
  ),
  constraint booking_cancelled_fields check (status <> 'cancelled' or cancelled_at is not null)
);

create index bookings_patient_idx on public.bookings (patient_user_id, scheduled_start desc);
create index bookings_therapist_idx on public.bookings (therapist_id, scheduled_start);
create index bookings_status_idx on public.bookings (status, scheduled_start);
create index bookings_service_idx on public.bookings (service_id);
create index bookings_family_idx on public.bookings (family_member_id);
create index bookings_slot_range_idx on public.bookings using gist (slot_range);

-- Maintain slot_range from start/end/buffer (timestamptz + interval is not immutable,
-- so it cannot be a generated column).
create or replace function public.bookings_set_slot_range() returns trigger
language plpgsql as $$
begin
  new.slot_range := tstzrange(
    new.scheduled_start,
    new.scheduled_end + make_interval(mins => new.buffer_minutes),
    '[)'
  );
  return new;
end $$;
create trigger bookings_slot_range before insert or update of scheduled_start, scheduled_end, buffer_minutes
  on public.bookings for each row execute function public.bookings_set_slot_range();
create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- DOUBLE-BOOKING PREVENTION (last line of defence, enforced by the database):
-- one therapist cannot hold two non-cancelled bookings whose slot ranges overlap.
alter table public.bookings add constraint bookings_no_therapist_overlap
  exclude using gist (therapist_id with =, slot_range with &&)
  where (therapist_id is not null and status <> 'cancelled');

-- A patient (or dependant) cannot hold two overlapping appointments either.
alter table public.bookings add constraint bookings_no_patient_overlap
  exclude using gist (
    (coalesce(family_member_id, patient_user_id)) with =,
    tstzrange(scheduled_start, scheduled_end, '[)') with &&
  )
  where (status <> 'cancelled');

-- Allowed status transitions (data-driven so the state machine is auditable).
create table public.booking_status_transitions (
  from_status public.booking_status not null,
  to_status public.booking_status not null,
  allowed_roles public.user_role[] not null,
  home_only boolean not null default false,
  primary key (from_status, to_status)
);

insert into public.booking_status_transitions (from_status, to_status, allowed_roles, home_only) values
  -- System-only transition: performed by confirm_payment() after a verified provider
  -- confirmation (or by create_booking for fully-prepaid package bookings). No human role
  -- may skip payment.
  ('pending',               'awaiting_confirmation', '{}', false),
  ('pending',               'cancelled',             '{patient,admin}', false),
  ('awaiting_confirmation', 'confirmed',             '{therapist,admin}', false),
  ('awaiting_confirmation', 'therapist_assigned',    '{therapist,admin}', false),
  ('awaiting_confirmation', 'cancelled',             '{patient,therapist,admin}', false),
  ('confirmed',             'therapist_assigned',    '{admin}', false),
  ('confirmed',             'on_the_way',            '{therapist,admin}', true),
  ('confirmed',             'arrived',               '{therapist,admin}', false),
  ('confirmed',             'cancelled',             '{patient,therapist,admin}', false),
  ('therapist_assigned',    'on_the_way',            '{therapist,admin}', true),
  ('therapist_assigned',    'arrived',               '{therapist,admin}', false),
  ('therapist_assigned',    'cancelled',             '{patient,therapist,admin}', false),
  ('on_the_way',            'arrived',               '{therapist,admin}', false),
  ('on_the_way',            'cancelled',             '{therapist,admin}', false),
  ('arrived',               'treatment_in_progress', '{therapist,admin}', false),
  ('arrived',               'cancelled',             '{admin}', false),
  ('treatment_in_progress', 'completed',             '{therapist,admin}', false);

create table public.booking_status_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  changed_by uuid references public.users (id),
  changed_by_role public.user_role,
  note text,
  created_at timestamptz not null default now()
);
create index booking_status_history_booking_idx on public.booking_status_history (booking_id, created_at);

-- Real location source for home-visit tracking. Only written by the therapist app
-- (expo-location) while a home booking is 'on_the_way'; deleted afterwards.
create table public.therapist_live_locations (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  therapist_id uuid not null references public.therapist_profiles (id) on delete cascade,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  heading numeric(5, 1),
  speed_mps numeric(6, 2),
  recorded_at timestamptz not null default now()
);

-- ───────────────────────── Payments ─────────────────────────
create sequence public.receipt_number_seq start 1;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payer_user_id uuid not null references public.users (id),
  booking_id uuid references public.bookings (id),
  package_purchase_id uuid references public.package_purchases (id),
  amount numeric(10, 2) not null check (amount > 0),
  currency char(3) not null default 'MYR',
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  provider text not null default 'unconfigured',
  provider_reference text,
  checkout_url text,
  paid_at timestamptz,
  failure_reason text,
  refunded_amount numeric(10, 2) not null default 0 check (refunded_amount >= 0),
  refund_required boolean not null default false,
  receipt_number text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_single_target check (
    (booking_id is not null)::int + (package_purchase_id is not null)::int = 1
  ),
  constraint payment_paid_fields check (status <> 'succeeded' or (paid_at is not null and receipt_number is not null)),
  constraint payment_refund_cap check (refunded_amount <= amount),
  constraint payment_provider_ref_unique unique (provider, provider_reference)
);
create index payments_payer_idx on public.payments (payer_user_id, created_at desc);
create index payments_booking_idx on public.payments (booking_id);
create index payments_status_idx on public.payments (status);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.package_purchases
  add column payment_id uuid references public.payments (id);

-- Provider event ledger. signature_verified must be true for events that change money state.
create table public.payment_transactions (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments (id) on delete cascade,
  event_type text not null,
  provider_reference text,
  amount numeric(10, 2),
  signature_verified boolean not null default false,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);
create index payment_transactions_payment_idx on public.payment_transactions (payment_id);

create table public.package_redemptions (
  id uuid primary key default gen_random_uuid(),
  package_purchase_id uuid not null references public.package_purchases (id),
  booking_id uuid not null unique references public.bookings (id),
  redeemed_at timestamptz not null default now(),
  reversed_at timestamptz
);
create index package_redemptions_purchase_idx on public.package_redemptions (package_purchase_id);

create table public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id),
  user_id uuid not null references public.users (id),
  booking_id uuid not null unique references public.bookings (id),
  discount_amount numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz
);
create index promotion_redemptions_promo_idx on public.promotion_redemptions (promotion_id, user_id);

-- ───────────────────────── Clinical data ─────────────────────────
-- Clinical rows are keyed by (patient_user_id, family_member_id): the account holder
-- and, if the care recipient is a dependant, that family member.

create table public.patient_medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_user_id uuid not null references public.users (id) on delete cascade,
  family_member_id uuid references public.family_members (id) on delete cascade,
  record_type public.record_type not null,
  title text not null check (length(trim(title)) > 0),
  description text,
  onset_date date,
  severity text check (severity is null or severity in ('mild', 'moderate', 'severe')),
  is_active boolean not null default true,
  -- private 'medical-documents' bucket: {patient_user_id}/{family_member_id|self}/{file}
  document_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medical_doc_has_path check (record_type <> 'document' or document_path is not null)
);
create index medical_records_patient_idx on public.patient_medical_records (patient_user_id, family_member_id, record_type);
create trigger patient_medical_records_updated_at before update on public.patient_medical_records
  for each row execute function public.set_updated_at();

create table public.treatment_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  therapist_id uuid not null references public.therapist_profiles (id),
  patient_user_id uuid not null references public.users (id),
  family_member_id uuid references public.family_members (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  pain_score_before smallint check (pain_score_before between 0 and 10),
  pain_score_after smallint check (pain_score_after between 0 and 10),
  patient_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_time_order check (ended_at is null or ended_at >= started_at)
);
create index treatment_sessions_patient_idx on public.treatment_sessions (patient_user_id, family_member_id, started_at desc);
create index treatment_sessions_therapist_idx on public.treatment_sessions (therapist_id, started_at desc);
create trigger treatment_sessions_updated_at before update on public.treatment_sessions
  for each row execute function public.set_updated_at();

create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  treatment_session_id uuid references public.treatment_sessions (id) on delete set null,
  therapist_id uuid not null references public.therapist_profiles (id),
  patient_user_id uuid not null references public.users (id),
  family_member_id uuid references public.family_members (id),
  subjective text,
  objective text,
  assessment text,
  plan text,
  -- Patient-facing plain-language summary. The whole note is visible to the patient
  -- only when share_with_patient = true.
  patient_summary text,
  share_with_patient boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_not_empty check (
    coalesce(subjective, objective, assessment, plan, patient_summary) is not null
  )
);
create index clinical_notes_patient_idx on public.clinical_notes (patient_user_id, family_member_id, created_at desc);
create index clinical_notes_booking_idx on public.clinical_notes (booking_id);
create trigger clinical_notes_updated_at before update on public.clinical_notes
  for each row execute function public.set_updated_at();

create table public.rehabilitation_goals (
  id uuid primary key default gen_random_uuid(),
  patient_user_id uuid not null references public.users (id) on delete cascade,
  family_member_id uuid references public.family_members (id) on delete cascade,
  therapist_id uuid not null references public.therapist_profiles (id),
  title text not null,
  description text,
  target_date date,
  status public.goal_status not null default 'active',
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rehab_goals_patient_idx on public.rehabilitation_goals (patient_user_id, family_member_id, status);
create trigger rehabilitation_goals_updated_at before update on public.rehabilitation_goals
  for each row execute function public.set_updated_at();

create table public.exercise_programmes (
  id uuid primary key default gen_random_uuid(),
  patient_user_id uuid not null references public.users (id) on delete cascade,
  family_member_id uuid references public.family_members (id) on delete cascade,
  therapist_id uuid not null references public.therapist_profiles (id),
  booking_id uuid references public.bookings (id) on delete set null,
  title text not null,
  description text,
  start_date date not null default current_date,
  end_date date,
  frequency_per_week smallint not null default 3 check (frequency_per_week between 1 and 14),
  status public.programme_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programme_dates check (end_date is null or end_date >= start_date)
);
create index exercise_programmes_patient_idx on public.exercise_programmes (patient_user_id, family_member_id, status);
create trigger exercise_programmes_updated_at before update on public.exercise_programmes
  for each row execute function public.set_updated_at();

create table public.exercise_programme_items (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.exercise_programmes (id) on delete cascade,
  name text not null,
  instructions text,
  sets smallint check (sets is null or sets between 1 and 20),
  reps smallint check (reps is null or reps between 1 and 200),
  hold_seconds smallint check (hold_seconds is null or hold_seconds between 1 and 600),
  video_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index exercise_items_programme_idx on public.exercise_programme_items (programme_id, sort_order);

create table public.exercise_completions (
  id uuid primary key default gen_random_uuid(),
  programme_item_id uuid not null references public.exercise_programme_items (id) on delete cascade,
  patient_user_id uuid not null references public.users (id) on delete cascade,
  completed_on date not null default (timezone('Asia/Kuala_Lumpur', now()))::date,
  completed_at timestamptz not null default now(),
  pain_level smallint check (pain_level between 0 and 10),
  notes text
);
create index exercise_completions_item_idx on public.exercise_completions (programme_item_id, completed_on);
create index exercise_completions_patient_idx on public.exercise_completions (patient_user_id, completed_on desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  patient_user_id uuid not null references public.users (id) on delete cascade,
  therapist_id uuid not null references public.therapist_profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 2000),
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index reviews_therapist_idx on public.reviews (therapist_id, created_at desc);

-- ───────────────────────── Notifications ─────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- ===== supabase/migrations/20260115000004_helpers_and_triggers.sql =====
-- ============================================================================
-- BeVital — migration 4: helper functions and triggers
-- ============================================================================
-- Security notes
--   * Helpers used by RLS policies are SECURITY DEFINER with a pinned search_path so
--     policies can consult users/bookings without recursive RLS evaluation.
--   * "Protected column" triggers are SECURITY INVOKER on purpose: current_user is the
--     calling database role ('authenticated' for direct client DML). RPCs that are
--     SECURITY DEFINER run as the function owner and are therefore trusted.
-- ============================================================================

-- ───────────────────────── Role / identity helpers ─────────────────────────
create or replace function public.auth_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select u.role from public.users u where u.id = auth.uid() and u.is_active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select u.role = 'admin' from public.users u where u.id = auth.uid() and u.is_active), false)
$$;

create or replace function public.my_therapist_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tp.id
  from public.therapist_profiles tp
  join public.users u on u.id = tp.user_id
  where tp.user_id = auth.uid() and u.is_active
$$;

-- Therapist ↔ patient relationship. "Treats" = has a booking that is past the unpaid
-- stage and not cancelled. The *_record_access variant additionally requires the patient's
-- consent to share their health profile for that booking.
create or replace function public.therapist_treats_user(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.therapist_id = public.my_therapist_id()
      and b.patient_user_id = p_patient
      and b.status not in ('pending', 'cancelled')
  )
$$;

create or replace function public.therapist_treats_patient(p_patient uuid, p_family uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.therapist_id = public.my_therapist_id()
      and b.patient_user_id = p_patient
      and b.family_member_id is not distinct from p_family
      and b.status not in ('pending', 'cancelled')
  )
$$;

create or replace function public.therapist_has_record_access(p_patient uuid, p_family uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.therapist_id = public.my_therapist_id()
      and b.patient_user_id = p_patient
      and b.family_member_id is not distinct from p_family
      and b.share_records_consent
      and b.status not in ('pending', 'cancelled')
  )
$$;

create or replace function public.setting_numeric(p_key text, p_default numeric) returns numeric
language sql stable set search_path = public as $$
  select coalesce((select (s.value #>> '{}')::numeric from public.system_settings s where s.key = p_key), p_default)
$$;

create or replace function public.setting_text(p_key text, p_default text) returns text
language sql stable set search_path = public as $$
  select coalesce((select s.value #>> '{}' from public.system_settings s where s.key = p_key), p_default)
$$;

-- Great-circle distance in km (Earth radius 6371 km).
create or replace function public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) returns numeric
language sql immutable parallel safe as $$
  select round((
    2 * 6371 * asin(sqrt(
      power(sin(radians((lat2 - lat1)::float8) / 2), 2) +
      cos(radians(lat1::float8)) * cos(radians(lat2::float8)) *
      power(sin(radians((lng2 - lng1)::float8) / 2), 2)
    ))
  )::numeric, 2)
$$;

-- ───────────────────────── Signup ─────────────────────────
-- Creates public.users + role profile for every new auth user. The role comes from
-- signup metadata but is whitelisted: only 'patient' or 'therapist' can ever be
-- self-selected. Admins are created/promoted out-of-band.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role;
  v_name text;
  v_phone text;
begin
  v_role := case when lower(coalesce(new.raw_user_meta_data ->> 'role', 'patient')) = 'therapist'
                 then 'therapist'::public.user_role else 'patient'::public.user_role end;
  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1));
  v_phone := nullif(coalesce(new.phone, new.raw_user_meta_data ->> 'phone'), '');
  if v_phone is not null and v_phone ~ '^[0-9]+$' then v_phone := '+' || v_phone; end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then v_phone := null; end if;

  insert into public.users (id, role, full_name, email, phone)
  values (new.id, v_role, v_name, new.email, v_phone)
  on conflict (id) do nothing;

  if v_role = 'patient' then
    insert into public.patient_profiles (user_id) values (new.id) on conflict do nothing;
  else
    insert into public.therapist_profiles (user_id, display_name, service_line_id)
    values (new.id, v_name, (select id from public.service_lines where slug = 'physiotherapy'))
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_auth_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.users set email = new.email where id = new.id and email is distinct from new.email;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_auth_email_change();

-- Keep the denormalised public therapist name/avatar in sync.
create or replace function public.sync_therapist_display() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.therapist_profiles
     set display_name = new.full_name, avatar_url = new.avatar_url
   where user_id = new.id
     and (display_name is distinct from new.full_name or avatar_url is distinct from new.avatar_url);
  return new;
end $$;
create trigger users_sync_therapist_display after update of full_name, avatar_url on public.users
  for each row execute function public.sync_therapist_display();

-- ───────────────────────── Protected columns ─────────────────────────
create or replace function public.is_client_session() returns boolean
language sql stable as $$ select current_user in ('authenticated', 'anon') $$;

create or replace function public.protect_users_columns() returns trigger
language plpgsql as $$
begin
  if public.is_client_session() and not public.is_admin() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception 'BV_FORBIDDEN: role, status and email cannot be changed by the user' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger users_protect before update on public.users
  for each row execute function public.protect_users_columns();

create or replace function public.protect_therapist_columns() returns trigger
language plpgsql as $$
begin
  if public.is_client_session() and not public.is_admin() then
    if new.user_id is distinct from old.user_id
       or new.service_line_id is distinct from old.service_line_id
       or new.clinic_id is distinct from old.clinic_id
       or new.display_name is distinct from old.display_name
       or new.avatar_url is distinct from old.avatar_url
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.rating_avg is distinct from old.rating_avg
       or new.rating_count is distinct from old.rating_count then
      raise exception 'BV_FORBIDDEN: verification, rating and clinic fields are managed by BeVital' using errcode = '42501';
    end if;
  end if;
  if new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
    new.verified_at := coalesce(new.verified_at, now());
    new.verified_by := coalesce(new.verified_by, auth.uid());
  end if;
  return new;
end $$;
create trigger therapist_profiles_protect before update on public.therapist_profiles
  for each row execute function public.protect_therapist_columns();

create or replace function public.protect_credential_columns() returns trigger
language plpgsql as $$
begin
  if public.is_client_session() and not public.is_admin() then
    if new.therapist_id is distinct from old.therapist_id
       or new.status is distinct from old.status
       or new.review_notes is distinct from old.review_notes
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'BV_FORBIDDEN: credential review fields are managed by BeVital' using errcode = '42501';
    end if;
  end if;
  if public.is_admin() and new.status is distinct from old.status then
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;
  return new;
end $$;
create trigger therapist_credentials_protect before update on public.therapist_credentials
  for each row execute function public.protect_credential_columns();

-- A therapist submitting a credential moves from 'pending' to 'under_review'.
create or replace function public.credential_submitted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.therapist_profiles set verification_status = 'under_review'
   where id = new.therapist_id and verification_status = 'pending';
  return new;
end $$;
create trigger therapist_credentials_submitted after insert on public.therapist_credentials
  for each row execute function public.credential_submitted();

-- Reviews: only completed bookings by the patient, one per booking, therapist must match.
create or replace function public.validate_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = new.booking_id;
  if not found or v_b.status <> 'completed' or v_b.patient_user_id <> new.patient_user_id
     or v_b.therapist_id is distinct from new.therapist_id then
    raise exception 'BV_INVALID_REVIEW: reviews are only allowed for your own completed appointments' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger reviews_validate before insert on public.reviews
  for each row execute function public.validate_review();

create or replace function public.refresh_therapist_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tid uuid := coalesce(new.therapist_id, old.therapist_id);
begin
  update public.therapist_profiles tp
     set rating_avg = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.therapist_id = v_tid and r.is_published), 0),
         rating_count = (select count(*) from public.reviews r where r.therapist_id = v_tid and r.is_published)
   where tp.id = v_tid;
  return null;
end $$;
create trigger reviews_refresh_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_therapist_rating();

-- ───────────────────────── Booking history + notifications ─────────────────────────
create or replace function public.notify(p_user uuid, p_type public.notification_type, p_title text, p_body text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, data)
  select p_user, p_type, p_title, p_body, p_data where p_user is not null
$$;

create or replace function public.bookings_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_service text;
  v_when text;
  v_therapist_user uuid;
  v_therapist_name text;
  v_data jsonb;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.therapist_id is not distinct from old.therapist_id then
    return null;
  end if;

  select s.name into v_service from public.services s where s.id = new.service_id;
  v_when := to_char(new.scheduled_start at time zone 'Asia/Kuala_Lumpur', 'DD Mon YYYY, HH12:MI AM');
  select tp.user_id, tp.display_name into v_therapist_user, v_therapist_name
    from public.therapist_profiles tp where tp.id = new.therapist_id;
  v_data := jsonb_build_object('booking_id', new.id, 'reference', new.reference, 'status', new.status);

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by, changed_by_role, note)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      auth.uid(),
      public.auth_role(),
      nullif(current_setting('bevital.status_note', true), '')
    );

    -- Live location is only valid while the therapist is on the way.
    if new.status <> 'on_the_way' then
      delete from public.therapist_live_locations where booking_id = new.id;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    case new.status
      when 'awaiting_confirmation' then
        perform public.notify(v_therapist_user, 'booking_confirmation', 'New booking request',
          v_service || ' on ' || v_when || '. Please accept or decline.', v_data);
      when 'confirmed' then
        perform public.notify(new.patient_user_id, 'booking_confirmation', 'Appointment confirmed',
          v_service || ' with ' || coalesce(v_therapist_name, 'your physiotherapist') || ' on ' || v_when || '.', v_data);
      when 'therapist_assigned' then
        perform public.notify(new.patient_user_id, 'therapist_assignment', 'Physiotherapist assigned',
          coalesce(v_therapist_name, 'A physiotherapist') || ' will see you on ' || v_when || '.', v_data);
      when 'on_the_way' then
        perform public.notify(new.patient_user_id, 'home_visit_update', 'Your physiotherapist is on the way',
          coalesce(v_therapist_name, 'Your physiotherapist') || ' is heading to your location.', v_data);
      when 'arrived' then
        -- At a clinic "arrived" is the patient's check-in; only home visits need an arrival alert.
        if new.appointment_type = 'home' then
          perform public.notify(new.patient_user_id, 'home_visit_update', 'Your physiotherapist has arrived',
            coalesce(v_therapist_name, 'Your physiotherapist') || ' is ready to begin.', v_data);
        end if;
      when 'completed' then
        perform public.notify(new.patient_user_id, 'system', 'Session completed',
          'Check My Recovery for your plan and exercises, and tell us how it went.', v_data);
      when 'cancelled' then
        if new.cancelled_by is distinct from new.patient_user_id then
          perform public.notify(new.patient_user_id, 'system', 'Appointment cancelled',
            v_service || ' on ' || v_when || ' was cancelled.' || coalesce(' Reason: ' || new.cancellation_reason, ''), v_data);
        end if;
        -- Therapists only hear about bookings they were actually asked to handle (i.e. paid ones).
        if v_therapist_user is not null and old.status <> 'pending'
           and new.cancelled_by is distinct from v_therapist_user then
          perform public.notify(v_therapist_user, 'system', 'Appointment cancelled',
            v_service || ' on ' || v_when || ' was cancelled.', v_data);
        end if;
      else null;
    end case;
  elsif tg_op = 'UPDATE' and new.therapist_id is distinct from old.therapist_id and new.status <> 'cancelled' then
    perform public.notify(v_therapist_user, 'booking_confirmation', 'New booking request',
      v_service || ' on ' || v_when || '. Please accept or decline.', v_data);
  end if;
  return null;
end $$;
create trigger bookings_after_change after insert or update on public.bookings
  for each row execute function public.bookings_after_change();

-- ───────────────────────── Audit logging ─────────────────────────
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  -- Columns whose values are safe to store in the log (no personal data).
  v_safe text[] := array['role', 'is_active', 'verification_status', 'status', 'clinic_id',
                         'is_accepting_bookings', 'is_published', 'is_featured', 'refund_required'];
  v_open boolean := tg_table_name in ('services', 'service_categories', 'clinics', 'packages', 'promotions', 'system_settings');
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> 'updated_at' and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(
          v_key,
          case when v_open or v_key = any (v_safe)
               then jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key)
               else to_jsonb(true) end);
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return null; end if;
  elsif v_open then
    v_changes := jsonb_build_object('row', v_row);
  end if;

  insert into public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), public.auth_role(), lower(tg_op), tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'user_id'), jsonb_build_object('changes', v_changes));
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['users', 'therapist_profiles', 'therapist_credentials', 'services', 'service_categories',
                           'clinics', 'packages', 'promotions', 'system_settings', 'payments', 'education_articles']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.audit_row_change()', 'audit_' || t, t);
  end loop;
end $$;

-- Explicit audit entry for reads of sensitive data (triggers cannot see SELECTs).
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), public.auth_role(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
$$;

-- ===== supabase/migrations/20260115000005_booking_engine_and_rpcs.sql =====
-- ============================================================================
-- BeVital — migration 5: availability, pricing, booking engine and business RPCs
-- ============================================================================
-- Principles
--   * Availability is computed from real therapist schedules, time off and existing
--     bookings. Nothing is simulated.
--   * Pricing is always recomputed on the server. The client may send the total it
--     displayed (p_expected_total) so a stale quote is rejected instead of charged.
--   * Double booking is prevented by exclusion constraints (migration 3) and the
--     functions below handle the resulting conflict gracefully.
--   * Error messages start with a stable code (BV_*) the apps map to friendly text.
-- ============================================================================

-- ───────────────────────── Small internal helpers ─────────────────────────
create or replace function public._buffer_minutes(p_type public.appointment_type) returns int
language sql stable set search_path = public as $$
  select case p_type
    when 'home' then public.setting_numeric('home_visit_buffer_minutes', 30)::int
    else public.setting_numeric('clinic_buffer_minutes', 0)::int
  end
$$;

create or replace function public._travel_fee(p_km numeric) returns numeric
language sql stable set search_path = public as $$
  select case
    when p_km <= public.setting_numeric('travel_fee_free_km', 3) then 0::numeric
    else least(
      round(public.setting_numeric('travel_fee_base', 5)
            + (p_km - public.setting_numeric('travel_fee_free_km', 3)) * public.setting_numeric('travel_fee_per_km', 1.5), 2),
      public.setting_numeric('travel_fee_max', 60))
  end
$$;

-- Releases package sessions and promo usage held by a booking (cancel / expiry).
create or replace function public._release_booking_resources(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_red public.package_redemptions;
begin
  select * into v_red from public.package_redemptions where booking_id = p_booking_id and reversed_at is null for update;
  if found then
    update public.package_redemptions set reversed_at = now() where id = v_red.id;
    update public.package_purchases
       set sessions_remaining = least(sessions_total, sessions_remaining + 1),
           status = case when status = 'exhausted' then 'active'::public.package_purchase_status else status end
     where id = v_red.package_purchase_id;
  end if;
  update public.promotion_redemptions set reversed_at = now() where booking_id = p_booking_id and reversed_at is null;
end $$;

-- Cancels unpaid bookings whose hold has lapsed. Called lazily by create_booking and
-- can also be scheduled (see docs/DEPLOYMENT.md).
create or replace function public.expire_stale_holds() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id from public.bookings
     where status = 'pending' and hold_expires_at is not null and hold_expires_at < now()
     for update skip locked
  loop
    perform set_config('bevital.status_note', 'Payment not completed before the hold expired', true);
    update public.bookings
       set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Payment not completed in time'
     where id = r.id;
    perform public._release_booking_resources(r.id);
    update public.payments set status = 'cancelled' where booking_id = r.id and status = 'pending';
    n := n + 1;
  end loop;
  return n;
end $$;

-- ───────────────────────── Availability ─────────────────────────
-- Therapists who could serve this request, ignoring time.
create or replace function public._eligible_therapists(
  p_service_id uuid, p_type public.appointment_type, p_clinic_id uuid, p_lat numeric, p_lng numeric
) returns table (therapist_id uuid, distance_km numeric)
language sql stable security definer set search_path = public as $$
  with cfg as (select public.setting_numeric('travel_distance_factor', 1.3) as factor)
  select tp.id,
         case when p_type = 'home' then
           round(public.haversine_km(p_lat, p_lng, priv.base_latitude, priv.base_longitude) * cfg.factor, 2)
         end
    from public.therapist_profiles tp
    join public.users u on u.id = tp.user_id and u.is_active
    join public.services s on s.id = p_service_id and s.is_active
    join public.therapist_services ts on ts.therapist_id = tp.id and ts.service_id = s.id
    left join public.therapist_private priv on priv.therapist_id = tp.id
    cross join cfg
   where tp.verification_status = 'verified'
     and tp.is_accepting_bookings
     and (
       (p_type = 'clinic' and s.supports_clinic and tp.offers_clinic_visits and tp.clinic_id = p_clinic_id
          and exists (select 1 from public.clinics c where c.id = tp.clinic_id and c.is_active))
       or
       (p_type = 'home' and s.supports_home and tp.offers_home_visits
          and p_lat is not null and p_lng is not null
          and priv.base_latitude is not null and priv.base_longitude is not null
          and public.haversine_km(p_lat, p_lng, priv.base_latitude, priv.base_longitude) * cfg.factor <= tp.service_radius_km)
     )
$$;

-- Is the therapist free (no conflicting booking / time off) and inside working hours?
create or replace function public._therapist_available(
  p_therapist uuid, p_start timestamptz, p_end timestamptz, p_type public.appointment_type, p_buffer int
) returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from public.therapist_availability a
       where a.therapist_id = p_therapist
         and a.day_of_week = extract(isodow from (p_start at time zone 'Asia/Kuala_Lumpur'))::int
         and a.location_type in (p_type::text, 'both')
         and (p_start at time zone 'Asia/Kuala_Lumpur')::time >= a.start_time
         and (p_end at time zone 'Asia/Kuala_Lumpur')::time <= a.end_time
         and (p_end at time zone 'Asia/Kuala_Lumpur')::date = (p_start at time zone 'Asia/Kuala_Lumpur')::date
    )
    and not exists (
      select 1 from public.bookings b
       where b.therapist_id = p_therapist
         and b.status <> 'cancelled'
         and not (b.status = 'pending' and b.hold_expires_at is not null and b.hold_expires_at < now())
         and b.slot_range && tstzrange(p_start, p_end + make_interval(mins => p_buffer), '[)')
    )
    and not exists (
      select 1 from public.therapist_time_off o
       where o.therapist_id = p_therapist
         and tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
    )
$$;

-- Ordered candidates able to take the slot. Home visits favour proximity; clinic visits favour rating.
create or replace function public._pick_candidates(
  p_service_id uuid, p_type public.appointment_type, p_start timestamptz, p_end timestamptz,
  p_clinic_id uuid, p_lat numeric, p_lng numeric,
  p_only_therapist uuid default null, p_exclude uuid[] default '{}'
) returns table (therapist_id uuid, distance_km numeric, rating_avg numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_buffer int := public._buffer_minutes(p_type);
begin
  return query
  select e.therapist_id, e.distance_km, tp.rating_avg
    from public._eligible_therapists(p_service_id, p_type, p_clinic_id, p_lat, p_lng) e
    join public.therapist_profiles tp on tp.id = e.therapist_id
   where (p_only_therapist is null or e.therapist_id = p_only_therapist)
     and not (e.therapist_id = any (coalesce(p_exclude, '{}')))
     and public._therapist_available(e.therapist_id, p_start, p_end, p_type, v_buffer)
   order by (case when p_type = 'home' then e.distance_km end) asc nulls last,
            tp.rating_avg desc, tp.rating_count desc, e.therapist_id;
end $$;

-- Step 4 of the booking flow: start times on a date where at least one real therapist is free.
create or replace function public.get_available_times(
  p_service_id uuid, p_type public.appointment_type, p_date date,
  p_clinic_id uuid default null, p_lat numeric default null, p_lng numeric default null
) returns table (start_at timestamptz, end_at timestamptz, therapist_count int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_dur int;
  v_step int := greatest(public.setting_numeric('slot_interval_minutes', 30)::int, 5);
  v_notice int := public.setting_numeric('min_notice_minutes', 120)::int;
  v_buffer int := public._buffer_minutes(p_type);
  v_tz constant text := 'Asia/Kuala_Lumpur';
begin
  if auth.uid() is null then raise exception 'BV_UNAUTHENTICATED' using errcode = '28000'; end if;
  select s.duration_minutes into v_dur from public.services s where s.id = p_service_id and s.is_active;
  if not found then return; end if;

  return query
  with el as (
    select * from public._eligible_therapists(p_service_id, p_type, p_clinic_id, p_lat, p_lng)
  ),
  windows as (
    select el.therapist_id,
           ((p_date + a.start_time) at time zone v_tz) as w_start,
           ((p_date + a.end_time) at time zone v_tz) as w_end
      from el
      join public.therapist_availability a
        on a.therapist_id = el.therapist_id
       and a.day_of_week = extract(isodow from p_date)::int
       and a.location_type in (p_type::text, 'both')
  ),
  cand as (
    select w.therapist_id, gs as s, gs + make_interval(mins => v_dur) as e
      from windows w
     cross join lateral generate_series(
       w.w_start, w.w_end - make_interval(mins => v_dur), make_interval(mins => v_step)) gs
  )
  select c.s, c.e, count(distinct c.therapist_id)::int
    from cand c
   where c.s >= now() + make_interval(mins => v_notice)
     and public._therapist_available(c.therapist_id, c.s, c.e, p_type, v_buffer)
   group by c.s, c.e
   order by c.s;
end $$;

-- Step 5 of the booking flow: the verified therapists who can take this exact slot.
create or replace function public.search_available_therapists(
  p_service_id uuid, p_type public.appointment_type, p_start timestamptz,
  p_clinic_id uuid default null, p_lat numeric default null, p_lng numeric default null
) returns table (
  therapist_id uuid, display_name text, avatar_url text, headline text, years_experience int,
  languages text[], rating_avg numeric, rating_count int, distance_km numeric,
  travel_fee numeric, service_price numeric
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_svc public.services; v_end timestamptz;
begin
  if auth.uid() is null then raise exception 'BV_UNAUTHENTICATED' using errcode = '28000'; end if;
  select * into v_svc from public.services where id = p_service_id and is_active;
  if not found then return; end if;
  v_end := p_start + make_interval(mins => v_svc.duration_minutes);

  return query
  select c.therapist_id, tp.display_name, tp.avatar_url, tp.headline, tp.years_experience,
         tp.languages, tp.rating_avg, tp.rating_count, c.distance_km,
         case when p_type = 'home' then public._travel_fee(coalesce(c.distance_km, 0)) else 0::numeric end,
         case p_type when 'clinic' then v_svc.price_clinic else v_svc.price_home end
    from public._pick_candidates(p_service_id, p_type, p_start, v_end, p_clinic_id, p_lat, p_lng) c
    join public.therapist_profiles tp on tp.id = c.therapist_id;
end $$;

-- ───────────────────────── Pricing ─────────────────────────
create or replace function public._price_quote(
  p_user uuid, p_service_id uuid, p_type public.appointment_type, p_distance_km numeric,
  p_promo_code text, p_package_purchase_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.services;
  v_service_price numeric(10, 2);
  v_travel numeric(10, 2) := 0;
  v_platform numeric(10, 2);
  v_discount numeric(10, 2) := 0;
  v_promo public.promotions;
  v_promo_id uuid;
  v_promo_error text;
  v_pkg public.package_purchases;
  v_pkg_id uuid;
  v_pkg_error text;
  v_total numeric(10, 2);
  v_used int;
  v_used_by_user int;
begin
  select * into s from public.services where id = p_service_id and is_active;
  if not found then raise exception 'BV_INVALID_SERVICE: service not available' using errcode = '22023'; end if;
  v_service_price := case p_type when 'clinic' then s.price_clinic else s.price_home end;
  if v_service_price is null or (p_type = 'clinic' and not s.supports_clinic) or (p_type = 'home' and not s.supports_home) then
    raise exception 'BV_INVALID_SERVICE: service is not offered for this appointment type' using errcode = '22023';
  end if;

  if p_type = 'home' then v_travel := public._travel_fee(coalesce(p_distance_km, 0)); end if;
  v_platform := public.setting_numeric('platform_fee', 0);

  if p_package_purchase_id is not null then
    select pp.* into v_pkg
      from public.package_purchases pp
      join public.packages pk on pk.id = pp.package_id
     where pp.id = p_package_purchase_id and pp.user_id = p_user and pp.status = 'active'
       and pp.sessions_remaining > 0 and pp.expires_at > now()
       and (pk.service_id is null or pk.service_id = p_service_id);
    if found then
      v_pkg_id := v_pkg.id; v_discount := v_service_price; v_platform := 0;
    else
      v_pkg_error := 'This package cannot be used for this appointment';
    end if;
  elsif p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo from public.promotions where code = upper(trim(p_promo_code));
    if not found or not v_promo.is_active or now() < v_promo.valid_from
       or (v_promo.valid_until is not null and now() > v_promo.valid_until) then
      v_promo_error := 'This promo code is not valid';
    elsif v_promo.min_spend > v_service_price + v_travel then
      v_promo_error := 'Minimum spend of RM ' || v_promo.min_spend || ' required';
    else
      select count(*) filter (where true), count(*) filter (where r.user_id = p_user)
        into v_used, v_used_by_user
        from public.promotion_redemptions r
       where r.promotion_id = v_promo.id and r.reversed_at is null;
      if v_promo.usage_limit is not null and v_used >= v_promo.usage_limit then
        v_promo_error := 'This promo code has been fully redeemed';
      elsif v_used_by_user >= v_promo.per_user_limit then
        v_promo_error := 'You have already used this promo code';
      else
        v_discount := least(
          v_service_price,
          case v_promo.discount_type
            when 'percent' then least(round(v_service_price * v_promo.discount_value / 100, 2),
                                      coalesce(v_promo.max_discount, v_service_price))
            else v_promo.discount_value
          end);
        v_promo_id := v_promo.id;
      end if;
    end if;
  end if;

  v_total := v_service_price + v_travel + v_platform - v_discount;
  return jsonb_build_object(
    'currency', 'MYR',
    'duration_minutes', s.duration_minutes,
    'service_price', v_service_price,
    'travel_distance_km', case when p_type = 'home' then p_distance_km end,
    'travel_fee', v_travel,
    'platform_fee', v_platform,
    'discount_amount', v_discount,
    'total_amount', v_total,
    'promotion_id', v_promo_id,
    'promo_error', v_promo_error,
    'package_purchase_id', v_pkg_id,
    'package_error', v_pkg_error,
    'payment_required', v_total > 0
  );
end $$;

create or replace function public.quote_booking(
  p_service_id uuid, p_type public.appointment_type, p_start timestamptz default null,
  p_clinic_id uuid default null, p_lat numeric default null, p_lng numeric default null,
  p_therapist_id uuid default null, p_promo_code text default null, p_package_purchase_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_svc public.services; v_cand record; v_quote jsonb;
begin
  if auth.uid() is null then raise exception 'BV_UNAUTHENTICATED' using errcode = '28000'; end if;
  select * into v_svc from public.services where id = p_service_id and is_active;
  if not found then raise exception 'BV_INVALID_SERVICE: service not available' using errcode = '22023'; end if;

  if p_start is not null then
    select * into v_cand from public._pick_candidates(
      p_service_id, p_type, p_start, p_start + make_interval(mins => v_svc.duration_minutes),
      p_clinic_id, p_lat, p_lng, p_therapist_id) limit 1;
    if not found then raise exception 'BV_SLOT_UNAVAILABLE: no physiotherapist is available at that time' using errcode = 'P0001'; end if;
  else
    select e.therapist_id, e.distance_km into v_cand
      from public._eligible_therapists(p_service_id, p_type, p_clinic_id, p_lat, p_lng) e
     where p_therapist_id is null or e.therapist_id = p_therapist_id
     order by e.distance_km asc nulls last limit 1;
    if not found then raise exception 'BV_NO_COVERAGE: no physiotherapist covers this location' using errcode = 'P0001'; end if;
  end if;

  v_quote := public._price_quote(auth.uid(), p_service_id, p_type, v_cand.distance_km, p_promo_code, p_package_purchase_id);
  return v_quote || jsonb_build_object('therapist_id', v_cand.therapist_id);
end $$;

-- ───────────────────────── Booking creation ─────────────────────────
create or replace function public.create_booking(
  p_service_id uuid,
  p_type public.appointment_type,
  p_start timestamptz,
  p_clinic_id uuid default null,
  p_address_id uuid default null,
  p_therapist_id uuid default null,          -- null = automatic matching
  p_family_member_id uuid default null,
  p_promo_code text default null,
  p_package_purchase_id uuid default null,
  p_notes text default null,
  p_symptoms text default null,
  p_share_records boolean default false,
  p_expected_total numeric default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_svc public.services;
  v_addr public.addresses;
  v_clinic public.clinics;
  v_fam public.family_members;
  v_end timestamptz;
  v_buffer int;
  v_lat numeric; v_lng numeric; v_text text;
  v_cand record;
  v_quote jsonb;
  v_booking public.bookings;
  v_constraint text;
  v_hold int := public.setting_numeric('payment_hold_minutes', 15)::int;
  v_notice int := public.setting_numeric('min_notice_minutes', 120)::int;
  v_max_days int := public.setting_numeric('max_advance_days', 60)::int;
  v_total numeric;
  v_taken boolean := false;
begin
  if v_uid is null or public.auth_role() is distinct from 'patient' then
    raise exception 'BV_FORBIDDEN: only patients can book appointments' using errcode = '42501';
  end if;

  select * into v_svc from public.services where id = p_service_id and is_active;
  if not found then raise exception 'BV_INVALID_SERVICE: service not available' using errcode = '22023'; end if;
  if (p_type = 'clinic' and not v_svc.supports_clinic) or (p_type = 'home' and not v_svc.supports_home) then
    raise exception 'BV_INVALID_SERVICE: service is not offered for this appointment type' using errcode = '22023';
  end if;

  if p_start < now() + make_interval(mins => v_notice) then
    raise exception 'BV_TOO_SOON: appointments need at least % minutes notice', v_notice using errcode = '22023';
  end if;
  if p_start > now() + make_interval(days => v_max_days) then
    raise exception 'BV_TOO_FAR: appointments can be booked up to % days ahead', v_max_days using errcode = '22023';
  end if;

  if p_family_member_id is not null then
    select * into v_fam from public.family_members
     where id = p_family_member_id and primary_user_id = v_uid and is_active;
    if not found then raise exception 'BV_FORBIDDEN: family member not found' using errcode = '42501'; end if;
    if v_fam.consent_granted_at is null then
      raise exception 'BV_CONSENT_REQUIRED: consent is required before booking for this family member' using errcode = '42501';
    end if;
  end if;

  if p_type = 'clinic' then
    select * into v_clinic from public.clinics where id = p_clinic_id and is_active;
    if not found then raise exception 'BV_INVALID_LOCATION: clinic not found' using errcode = '22023'; end if;
  else
    select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
    if not found then raise exception 'BV_INVALID_LOCATION: choose a saved address for the home visit' using errcode = '22023'; end if;
    v_lat := v_addr.latitude; v_lng := v_addr.longitude;
    v_text := concat_ws(', ', v_addr.line1, v_addr.line2, v_addr.postcode || ' ' || v_addr.city, v_addr.state);
  end if;

  perform public.expire_stale_holds();

  v_buffer := public._buffer_minutes(p_type);
  v_end := p_start + make_interval(mins => v_svc.duration_minutes);

  for v_cand in
    select * from public._pick_candidates(p_service_id, p_type, p_start, v_end,
                                          p_clinic_id, v_lat, v_lng, p_therapist_id)
  loop
    v_quote := public._price_quote(v_uid, p_service_id, p_type, v_cand.distance_km, p_promo_code, p_package_purchase_id);
    if p_promo_code is not null and length(trim(p_promo_code)) > 0 and p_package_purchase_id is null
       and (v_quote ->> 'promo_error') is not null then
      raise exception 'BV_INVALID_PROMO: %', v_quote ->> 'promo_error' using errcode = '22023';
    end if;
    if p_package_purchase_id is not null and (v_quote ->> 'package_error') is not null then
      raise exception 'BV_INVALID_PACKAGE: %', v_quote ->> 'package_error' using errcode = '22023';
    end if;
    v_total := (v_quote ->> 'total_amount')::numeric;
    if p_expected_total is not null and v_total <> p_expected_total then
      raise exception 'BV_PRICE_CHANGED: the price changed to RM %', v_total using errcode = 'P0001';
    end if;

    begin
      insert into public.bookings (
        patient_user_id, family_member_id, service_id, appointment_type, clinic_id, address_id,
        visit_address_text, visit_latitude, visit_longitude, visit_notes,
        therapist_id, requested_therapist_id, auto_matched,
        scheduled_start, scheduled_end, buffer_minutes, status, hold_expires_at,
        service_price, travel_distance_km, travel_fee, platform_fee, discount_amount, total_amount,
        promotion_id, package_purchase_id, patient_notes, symptoms, share_records_consent
      ) values (
        v_uid, p_family_member_id, p_service_id, p_type,
        case when p_type = 'clinic' then p_clinic_id end,
        case when p_type = 'home' then p_address_id end,
        v_text, v_lat, v_lng, case when p_type = 'home' then v_addr.access_notes end,
        v_cand.therapist_id, p_therapist_id, p_therapist_id is null,
        p_start, v_end, v_buffer, 'pending', now() + make_interval(mins => v_hold),
        (v_quote ->> 'service_price')::numeric, nullif(v_quote ->> 'travel_distance_km', '')::numeric,
        (v_quote ->> 'travel_fee')::numeric, (v_quote ->> 'platform_fee')::numeric,
        (v_quote ->> 'discount_amount')::numeric, v_total,
        nullif(v_quote ->> 'promotion_id', '')::uuid, nullif(v_quote ->> 'package_purchase_id', '')::uuid,
        nullif(trim(p_notes), ''), nullif(trim(p_symptoms), ''), coalesce(p_share_records, false)
      ) returning * into v_booking;
      v_taken := true;
      exit;
    exception when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bookings_no_patient_overlap' then
        raise exception 'BV_PATIENT_OVERLAP: you already have an appointment at this time' using errcode = 'P0001';
      end if;
      -- therapist slot was taken by a concurrent booking: try the next candidate
    end;
  end loop;

  if not v_taken then
    raise exception 'BV_SLOT_UNAVAILABLE: that time is no longer available' using errcode = 'P0001';
  end if;

  if v_booking.package_purchase_id is not null then
    update public.package_purchases
       set sessions_remaining = sessions_remaining - 1,
           status = case when sessions_remaining - 1 = 0 then 'exhausted'::public.package_purchase_status else status end
     where id = v_booking.package_purchase_id and sessions_remaining > 0 and status = 'active';
    if not found then
      raise exception 'BV_INVALID_PACKAGE: no sessions remaining' using errcode = '22023';
    end if;
    insert into public.package_redemptions (package_purchase_id, booking_id)
    values (v_booking.package_purchase_id, v_booking.id);
  end if;

  if v_booking.promotion_id is not null then
    insert into public.promotion_redemptions (promotion_id, user_id, booking_id, discount_amount)
    values (v_booking.promotion_id, v_uid, v_booking.id, v_booking.discount_amount);
  end if;

  if coalesce(p_share_records, false) then
    insert into public.consents (user_id, family_member_id, consent_type)
    values (v_uid, p_family_member_id, 'therapist_record_access');
  end if;

  -- Fully covered (e.g. by a package): nothing to pay, goes straight to the therapist.
  if v_booking.total_amount = 0 then
    perform set_config('bevital.status_note', 'No payment required', true);
    update public.bookings set status = 'awaiting_confirmation', hold_expires_at = null where id = v_booking.id;
  end if;

  select * into v_booking from public.bookings where id = v_booking.id;
  return v_booking;
end $$;

-- ───────────────────────── Cancellation & therapist response ─────────────────────────
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role := public.auth_role();
  v_b public.bookings;
  v_allowed boolean;
  v_window numeric := public.setting_numeric('free_cancellation_hours', 24);
begin
  if v_uid is null or v_role is null then raise exception 'BV_UNAUTHENTICATED' using errcode = '28000'; end if;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BV_NOT_FOUND: booking not found' using errcode = 'P0002'; end if;

  if not (
    (v_role = 'patient' and v_b.patient_user_id = v_uid)
    or (v_role = 'therapist' and v_b.therapist_id = public.my_therapist_id())
    or v_role = 'admin'
  ) then
    raise exception 'BV_FORBIDDEN: not your booking' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.booking_status_transitions t
     where t.from_status = v_b.status and t.to_status = 'cancelled' and v_role = any (t.allowed_roles)
  ) into v_allowed;
  if not v_allowed then
    raise exception 'BV_INVALID_TRANSITION: a % booking cannot be cancelled', v_b.status using errcode = 'P0001';
  end if;

  perform set_config('bevital.status_note', coalesce(p_reason, ''), true);
  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
         cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
         late_cancellation = (v_role = 'patient' and v_b.scheduled_start - now() < make_interval(hours => v_window::int)),
         hold_expires_at = null
   where id = p_booking_id;

  perform public._release_booking_resources(p_booking_id);
  update public.payments set status = 'cancelled' where booking_id = p_booking_id and status = 'pending';
  -- Money already collected is never silently kept: flag for a refund decision.
  update public.payments set refund_required = true
   where booking_id = p_booking_id and status = 'succeeded' and refunded_amount < amount;

  select * into v_b from public.bookings where id = p_booking_id;
  return v_b;
end $$;

create or replace function public.therapist_respond_to_booking(
  p_booking_id uuid, p_accept boolean, p_reason text default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_tid uuid := public.my_therapist_id();
  v_b public.bookings;
  v_end timestamptz;
  v_cand record;
  v_reassigned boolean := false;
begin
  if v_tid is null then raise exception 'BV_FORBIDDEN: therapists only' using errcode = '42501'; end if;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found or v_b.therapist_id is distinct from v_tid then
    raise exception 'BV_FORBIDDEN: not your booking' using errcode = '42501';
  end if;
  if v_b.status <> 'awaiting_confirmation' then
    raise exception 'BV_INVALID_TRANSITION: this request is no longer awaiting your response' using errcode = 'P0001';
  end if;

  if p_accept then
    perform set_config('bevital.status_note', 'Accepted by physiotherapist', true);
    update public.bookings
       set status = case when v_b.auto_matched or v_b.requested_therapist_id is distinct from v_b.therapist_id
                         then 'therapist_assigned'::public.booking_status else 'confirmed'::public.booking_status end
     where id = p_booking_id;
  else
    -- Declined. Automatic-match bookings are offered to the next available therapist.
    if v_b.auto_matched then
      v_end := v_b.scheduled_end;
      for v_cand in
        select * from public._pick_candidates(
          v_b.service_id, v_b.appointment_type, v_b.scheduled_start, v_b.scheduled_end, v_b.clinic_id,
          v_b.visit_latitude, v_b.visit_longitude, null, v_b.declined_therapist_ids || v_tid)
      loop
        begin
          update public.bookings
             set therapist_id = v_cand.therapist_id,
                 declined_therapist_ids = v_b.declined_therapist_ids || v_tid
           where id = p_booking_id;
          v_reassigned := true;
          exit;
        exception when exclusion_violation then
          null; -- taken meanwhile, try next
        end;
      end loop;
    end if;

    if not v_reassigned then
      perform set_config('bevital.status_note', coalesce(p_reason, 'Declined by physiotherapist'), true);
      update public.bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = (select user_id from public.therapist_profiles where id = v_tid),
             cancellation_reason = coalesce(nullif(trim(p_reason), ''), 'Declined by physiotherapist'),
             declined_therapist_ids = v_b.declined_therapist_ids || v_tid, hold_expires_at = null
       where id = p_booking_id;
      perform public._release_booking_resources(p_booking_id);
      update public.payments set refund_required = true
       where booking_id = p_booking_id and status = 'succeeded' and refunded_amount < amount;
    end if;
  end if;

  select * into v_b from public.bookings where id = p_booking_id;
  return v_b;
end $$;

-- Generic status progression for therapists/admins (validated against the transitions table).
create or replace function public.update_booking_status(p_booking_id uuid, p_new_status public.booking_status, p_note text default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role := public.auth_role();
  v_b public.bookings;
  v_rule public.booking_status_transitions;
  v_commission numeric := public.setting_numeric('platform_commission_rate', 0.20);
begin
  if v_uid is null or v_role is null then raise exception 'BV_UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_new_status = 'cancelled' then return public.cancel_booking(p_booking_id, p_note); end if;

  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BV_NOT_FOUND: booking not found' using errcode = 'P0002'; end if;

  if v_role = 'therapist' then
    if v_b.therapist_id is distinct from public.my_therapist_id() then
      raise exception 'BV_FORBIDDEN: not your booking' using errcode = '42501';
    end if;
  elsif v_role <> 'admin' then
    raise exception 'BV_FORBIDDEN: not allowed' using errcode = '42501';
  end if;

  select * into v_rule from public.booking_status_transitions t
   where t.from_status = v_b.status and t.to_status = p_new_status;
  if not found or not (v_role = any (v_rule.allowed_roles)) then
    raise exception 'BV_INVALID_TRANSITION: cannot move a % booking to %', v_b.status, p_new_status using errcode = 'P0001';
  end if;
  if v_rule.home_only and v_b.appointment_type <> 'home' then
    raise exception 'BV_INVALID_TRANSITION: only home visits can be marked on the way' using errcode = 'P0001';
  end if;

  perform set_config('bevital.status_note', coalesce(p_note, ''), true);

  if p_new_status = 'treatment_in_progress' then
    insert into public.treatment_sessions (booking_id, therapist_id, patient_user_id, family_member_id)
    values (v_b.id, v_b.therapist_id, v_b.patient_user_id, v_b.family_member_id)
    on conflict (booking_id) do nothing;
  elsif p_new_status = 'completed' then
    insert into public.treatment_sessions (booking_id, therapist_id, patient_user_id, family_member_id)
    values (v_b.id, v_b.therapist_id, v_b.patient_user_id, v_b.family_member_id)
    on conflict (booking_id) do nothing;
    update public.treatment_sessions set ended_at = now() where booking_id = v_b.id and ended_at is null;
    update public.bookings
       set therapist_earning = round((service_price + travel_fee) * (1 - v_commission), 2)
     where id = v_b.id;
  end if;

  update public.bookings set status = p_new_status where id = p_booking_id;
  select * into v_b from public.bookings where id = p_booking_id;
  return v_b;
end $$;

create or replace function public.admin_assign_therapist(p_booking_id uuid, p_therapist_id uuid)
returns public.bookings
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_b public.bookings; v_ok boolean;
begin
  if not public.is_admin() then raise exception 'BV_FORBIDDEN: admins only' using errcode = '42501'; end if;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BV_NOT_FOUND: booking not found' using errcode = 'P0002'; end if;
  if v_b.status not in ('awaiting_confirmation', 'confirmed', 'therapist_assigned') then
    raise exception 'BV_INVALID_TRANSITION: a % booking cannot be reassigned', v_b.status using errcode = 'P0001';
  end if;
  select exists (
    select 1 from public._eligible_therapists(v_b.service_id, v_b.appointment_type, v_b.clinic_id, v_b.visit_latitude, v_b.visit_longitude) e
     where e.therapist_id = p_therapist_id
       and public._therapist_available(e.therapist_id, v_b.scheduled_start, v_b.scheduled_end, v_b.appointment_type, v_b.buffer_minutes)
  ) into v_ok;
  if not v_ok then raise exception 'BV_SLOT_UNAVAILABLE: that physiotherapist cannot take this appointment' using errcode = 'P0001'; end if;

  perform set_config('bevital.status_note', 'Reassigned by admin', true);
  begin
    update public.bookings
       set therapist_id = p_therapist_id, auto_matched = true, status = 'awaiting_confirmation'
     where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'BV_SLOT_UNAVAILABLE: that physiotherapist was just booked' using errcode = 'P0001';
  end;
  perform public.log_audit('assign_therapist', 'bookings', p_booking_id::text, jsonb_build_object('therapist_id', p_therapist_id));
  select * into v_b from public.bookings where id = p_booking_id;
  return v_b;
end $$;

create or replace function public.set_booking_record_sharing(p_booking_id uuid, p_share boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id and patient_user_id = auth.uid();
  if not found then raise exception 'BV_NOT_FOUND: booking not found' using errcode = 'P0002'; end if;
  update public.bookings set share_records_consent = p_share where id = p_booking_id;
  if p_share then
    insert into public.consents (user_id, family_member_id, consent_type) values (v_b.patient_user_id, v_b.family_member_id, 'therapist_record_access');
  else
    update public.consents set revoked_at = now()
     where user_id = v_b.patient_user_id and family_member_id is not distinct from v_b.family_member_id
       and consent_type = 'therapist_record_access' and revoked_at is null;
  end if;
  perform public.log_audit(case when p_share then 'grant_record_access' else 'revoke_record_access' end, 'bookings', p_booking_id::text);
end $$;

-- ───────────────────────── Payments ─────────────────────────
-- A payment row is created by the patient (status 'pending'). It can ONLY become
-- 'succeeded' via confirm_payment(), which only the service role can execute — i.e. the
-- server-side webhook after the payment provider's signature has been verified.
create or replace function public.initiate_payment(p_booking_id uuid, p_method public.payment_method)
returns public.payments
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings; v_p public.payments;
begin
  if p_method = 'package_credit' then raise exception 'BV_INVALID_PAYMENT: package credit is applied at booking time' using errcode = '22023'; end if;
  select * into v_b from public.bookings where id = p_booking_id and patient_user_id = auth.uid() for update;
  if not found then raise exception 'BV_NOT_FOUND: booking not found' using errcode = 'P0002'; end if;
  if v_b.status <> 'pending' then raise exception 'BV_INVALID_PAYMENT: this booking is not awaiting payment' using errcode = 'P0001'; end if;
  if v_b.total_amount <= 0 then raise exception 'BV_INVALID_PAYMENT: nothing to pay' using errcode = 'P0001'; end if;

  select * into v_p from public.payments where booking_id = p_booking_id and status = 'pending' order by created_at desc limit 1;
  if found then
    update public.payments set method = p_method where id = v_p.id returning * into v_p;
  else
    insert into public.payments (payer_user_id, booking_id, amount, method, provider)
    values (auth.uid(), p_booking_id, v_b.total_amount, p_method, public.setting_text('payment_provider', 'unconfigured'))
    returning * into v_p;
  end if;
  -- Give the checkout a little longer than the base hold.
  update public.bookings
     set hold_expires_at = greatest(hold_expires_at, now() + make_interval(mins => 20))
   where id = p_booking_id;
  return v_p;
end $$;

create or replace function public.purchase_package(p_package_id uuid, p_method public.payment_method)
returns public.payments
language plpgsql security definer set search_path = public as $$
declare v_pk public.packages; v_pp public.package_purchases; v_p public.payments;
begin
  if public.auth_role() is distinct from 'patient' then raise exception 'BV_FORBIDDEN: patients only' using errcode = '42501'; end if;
  if p_method = 'package_credit' then raise exception 'BV_INVALID_PAYMENT: choose a payment method' using errcode = '22023'; end if;
  select * into v_pk from public.packages where id = p_package_id and is_active;
  if not found then raise exception 'BV_NOT_FOUND: package not available' using errcode = 'P0002'; end if;
  if v_pk.price <= 0 then raise exception 'BV_INVALID_PAYMENT: package has no price' using errcode = '22023'; end if;
  insert into public.package_purchases (package_id, user_id, sessions_total, sessions_remaining)
  values (v_pk.id, auth.uid(), v_pk.session_count, v_pk.session_count) returning * into v_pp;
  insert into public.payments (payer_user_id, package_purchase_id, amount, method, provider)
  values (auth.uid(), v_pp.id, v_pk.price, p_method, public.setting_text('payment_provider', 'unconfigured'))
  returning * into v_p;
  update public.package_purchases set payment_id = v_p.id where id = v_pp.id;
  return v_p;
end $$;

-- SERVICE ROLE ONLY. Called by the payment webhook after signature verification.
create or replace function public.confirm_payment(
  p_payment_id uuid, p_provider_reference text, p_amount numeric, p_raw jsonb default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_p public.payments;
  v_b public.bookings;
  v_pk public.packages;
  v_pp public.package_purchases;
begin
  select * into v_p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'BV_NOT_FOUND: payment not found' using errcode = 'P0002'; end if;
  if v_p.status = 'succeeded' then return v_p; end if; -- idempotent for webhook retries

  if p_amount is distinct from v_p.amount then
    insert into public.payment_transactions (payment_id, event_type, provider_reference, amount, signature_verified, raw_payload)
    values (v_p.id, 'amount_mismatch', p_provider_reference, p_amount, true, p_raw);
    update public.payments set status = 'failed', failure_reason = 'Amount mismatch: expected ' || v_p.amount || ' received ' || coalesce(p_amount::text, 'null')
     where id = v_p.id returning * into v_p;
    return v_p;
  end if;

  update public.payments
     set status = 'succeeded', paid_at = now(), provider_reference = coalesce(p_provider_reference, provider_reference),
         receipt_number = 'RCT-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYYMM') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0'),
         failure_reason = null
   where id = v_p.id returning * into v_p;
  insert into public.payment_transactions (payment_id, event_type, provider_reference, amount, signature_verified, raw_payload)
  values (v_p.id, 'payment.succeeded', p_provider_reference, p_amount, true, p_raw);

  if v_p.booking_id is not null then
    select * into v_b from public.bookings where id = v_p.booking_id for update;
    if v_b.status = 'pending' then
      perform set_config('bevital.status_note', 'Payment verified', true);
      update public.bookings set status = 'awaiting_confirmation', hold_expires_at = null where id = v_b.id;
    elsif v_b.status = 'cancelled' then
      -- Paid after the hold lapsed: keep the truthful payment record and queue a refund decision.
      update public.payments set refund_required = true where id = v_p.id returning * into v_p;
    end if;
  elsif v_p.package_purchase_id is not null then
    select * into v_pp from public.package_purchases where id = v_p.package_purchase_id for update;
    select * into v_pk from public.packages where id = v_pp.package_id;
    update public.package_purchases
       set status = 'active', purchased_at = now(), expires_at = now() + make_interval(days => v_pk.validity_days)
     where id = v_pp.id and status = 'pending_payment';
  end if;

  perform public.notify(v_p.payer_user_id, 'payment_confirmation', 'Payment received',
    'We received RM ' || to_char(v_p.amount, 'FM999990.00') || '. Receipt ' || v_p.receipt_number || '.',
    jsonb_build_object('payment_id', v_p.id, 'booking_id', v_p.booking_id, 'receipt_number', v_p.receipt_number));
  return v_p;
end $$;

create or replace function public.fail_payment(p_payment_id uuid, p_reason text, p_raw jsonb default null)
returns public.payments
language plpgsql security definer set search_path = public as $$
declare v_p public.payments;
begin
  update public.payments set status = 'failed', failure_reason = p_reason
   where id = p_payment_id and status in ('pending', 'processing') returning * into v_p;
  if found then
    insert into public.payment_transactions (payment_id, event_type, signature_verified, raw_payload)
    values (p_payment_id, 'payment.failed', true, p_raw);
  else
    select * into v_p from public.payments where id = p_payment_id;
  end if;
  return v_p;
end $$;

-- ───────────────────────── Clinical access (audited) ─────────────────────────
-- Therapists never SELECT patient_medical_records directly. This function checks the
-- treating relationship + the patient's consent, and writes an audit entry per access.
create or replace function public.therapist_get_patient_health(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_b public.bookings;
  v_u public.users;
  v_pp public.patient_profiles;
  v_fam public.family_members;
  v_records jsonb;
begin
  select * into v_b from public.bookings where id = p_booking_id and therapist_id = public.my_therapist_id();
  if not found then raise exception 'BV_FORBIDDEN: not your patient' using errcode = '42501'; end if;
  if v_b.status in ('pending', 'cancelled') then raise exception 'BV_FORBIDDEN: booking is not active' using errcode = '42501'; end if;
  if not v_b.share_records_consent then
    raise exception 'BV_CONSENT_REQUIRED: the patient has not shared their health profile for this booking' using errcode = '42501';
  end if;

  select * into v_u from public.users where id = v_b.patient_user_id;
  select * into v_pp from public.patient_profiles where user_id = v_b.patient_user_id;
  if v_b.family_member_id is not null then
    select * into v_fam from public.family_members where id = v_b.family_member_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'record_type', r.record_type, 'title', r.title, 'description', r.description,
           'onset_date', r.onset_date, 'severity', r.severity, 'document_path', r.document_path)
         order by r.record_type, r.created_at), '[]'::jsonb)
    into v_records
    from public.patient_medical_records r
   where r.patient_user_id = v_b.patient_user_id
     and r.family_member_id is not distinct from v_b.family_member_id
     and r.is_active;

  perform public.log_audit('view_health_record', 'bookings', p_booking_id::text,
    jsonb_build_object('patient_user_id', v_b.patient_user_id, 'family_member_id', v_b.family_member_id));

  return jsonb_build_object(
    'patient', jsonb_build_object(
      'name', coalesce(v_fam.full_name, v_u.full_name),
      'date_of_birth', coalesce(v_fam.date_of_birth, v_pp.date_of_birth),
      'gender', coalesce(v_fam.gender, v_pp.gender),
      'relationship', v_fam.relationship,
      'booked_by', v_u.full_name,
      'phone', coalesce(v_u.phone, v_fam.phone)),
    'emergency_contact', jsonb_build_object(
      'name', v_pp.emergency_contact_name, 'phone', v_pp.emergency_contact_phone,
      'relationship', v_pp.emergency_contact_relationship),
    'records', v_records);
end $$;

create or replace function public.therapist_earnings_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tid uuid := public.my_therapist_id(); v_result jsonb;
begin
  if v_tid is null then raise exception 'BV_FORBIDDEN: therapists only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'completed_sessions', count(*) filter (where b.status = 'completed'),
    'total_earned', coalesce(sum(b.therapist_earning) filter (where b.status = 'completed'), 0),
    'this_month', coalesce(sum(b.therapist_earning) filter (
        where b.status = 'completed'
          and date_trunc('month', b.scheduled_start at time zone 'Asia/Kuala_Lumpur') = date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur')), 0),
    'upcoming_sessions', count(*) filter (where b.status in ('awaiting_confirmation', 'confirmed', 'therapist_assigned', 'on_the_way', 'arrived', 'treatment_in_progress')),
    'upcoming_estimate', coalesce(sum(round((b.service_price + b.travel_fee) * (1 - public.setting_numeric('platform_commission_rate', 0.20)), 2))
        filter (where b.status in ('confirmed', 'therapist_assigned', 'on_the_way', 'arrived', 'treatment_in_progress')), 0),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'earned', m.earned, 'sessions', m.sessions) order by m.month)
        from (
          select to_char(date_trunc('month', b2.scheduled_start at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM') as month,
                 sum(b2.therapist_earning) as earned, count(*) as sessions
            from public.bookings b2
           where b2.therapist_id = v_tid and b2.status = 'completed'
             and b2.scheduled_start > now() - interval '6 months'
           group by 1) m), '[]'::jsonb)
  ) into v_result
  from public.bookings b where b.therapist_id = v_tid;
  return v_result;
end $$;

-- ───────────────────────── Admin analytics (real data only) ─────────────────────────
create or replace function public.admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur';
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'BV_FORBIDDEN: admins only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total_patients', (select count(*) from public.users where role = 'patient'),
    'active_patients', (select count(distinct b.patient_user_id) from public.bookings b
                         where b.created_at > now() - interval '90 days' and b.status <> 'cancelled'),
    'total_therapists', (select count(*) from public.therapist_profiles),
    'verified_therapists', (select count(*) from public.therapist_profiles where verification_status = 'verified'),
    'pending_verification', (select count(*) from public.therapist_profiles where verification_status = 'under_review'),
    'appointments_today', (select count(*) from public.bookings b
                            where b.status not in ('cancelled', 'pending')
                              and b.scheduled_start >= v_today_start and b.scheduled_start < v_today_start + interval '1 day'),
    'appointments_month', (select count(*) from public.bookings b
                            where b.status not in ('cancelled', 'pending')
                              and b.scheduled_start >= v_month_start and b.scheduled_start < v_month_start + interval '1 month'),
    'revenue_total', coalesce((select sum(p.amount - p.refunded_amount) from public.payments p where p.status in ('succeeded', 'partially_refunded')), 0),
    'revenue_month', coalesce((select sum(p.amount - p.refunded_amount) from public.payments p
                                where p.status in ('succeeded', 'partially_refunded') and p.paid_at >= v_month_start), 0),
    'popular_services', coalesce((
      select jsonb_agg(jsonb_build_object('service_id', x.id, 'name', x.name, 'bookings', x.n) order by x.n desc)
        from (select s.id, s.name, count(*) n
                from public.bookings b join public.services s on s.id = b.service_id
               where b.status not in ('cancelled', 'pending')
               group by s.id, s.name order by n desc limit 5) x), '[]'::jsonb),
    -- Abandoned checkouts (hold expired) are not counted as cancellations.
    'cancellation_rate', coalesce((
      select round(100.0 * count(*) filter (where b.status = 'cancelled') / nullif(count(*), 0), 1)
        from public.bookings b
       where coalesce(b.cancellation_reason, '') <> 'Payment not completed in time'), 0),
    'clinic_bookings', (select count(*) from public.bookings where appointment_type = 'clinic' and status not in ('cancelled', 'pending')),
    'home_bookings', (select count(*) from public.bookings where appointment_type = 'home' and status not in ('cancelled', 'pending')),
    'therapist_utilisation', coalesce((
      select jsonb_agg(jsonb_build_object(
               'therapist_id', t.id, 'name', t.display_name,
               'booked_minutes', coalesce(bk.minutes, 0),
               'available_minutes', round(coalesce(av.weekly_minutes, 0) * 30.0 / 7),
               'utilisation_pct', case when coalesce(av.weekly_minutes, 0) = 0 then 0
                                       else round(100.0 * coalesce(bk.minutes, 0) / (av.weekly_minutes * 30.0 / 7), 1) end)
             order by t.display_name)
        from public.therapist_profiles t
        left join (select a.therapist_id, sum(extract(epoch from (a.end_time - a.start_time)) / 60) weekly_minutes
                     from public.therapist_availability a group by a.therapist_id) av on av.therapist_id = t.id
        left join (select b.therapist_id, sum(extract(epoch from (b.scheduled_end - b.scheduled_start)) / 60) minutes
                     from public.bookings b
                    where b.status in ('confirmed', 'therapist_assigned', 'on_the_way', 'arrived', 'treatment_in_progress', 'completed')
                      and b.scheduled_start > now() - interval '30 days' and b.scheduled_start <= now()
                    group by b.therapist_id) bk on bk.therapist_id = t.id
       where t.verification_status = 'verified'), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.admin_report_timeseries(p_from date, p_to date) returns table (
  day date, bookings bigint, completed bigint, cancelled bigint, revenue numeric
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'BV_FORBIDDEN: admins only' using errcode = '42501'; end if;
  if p_to - p_from > 366 then raise exception 'BV_INVALID_RANGE: maximum range is 366 days' using errcode = '22023'; end if;
  return query
  select d::date,
         (select count(*) from public.bookings b where (b.scheduled_start at time zone 'Asia/Kuala_Lumpur')::date = d::date and b.status <> 'pending'),
         (select count(*) from public.bookings b where (b.scheduled_start at time zone 'Asia/Kuala_Lumpur')::date = d::date and b.status = 'completed'),
         (select count(*) from public.bookings b where (b.scheduled_start at time zone 'Asia/Kuala_Lumpur')::date = d::date and b.status = 'cancelled'
             and coalesce(b.cancellation_reason, '') <> 'Payment not completed in time'),
         coalesce((select sum(p.amount - p.refunded_amount) from public.payments p
                    where p.status in ('succeeded', 'partially_refunded') and (p.paid_at at time zone 'Asia/Kuala_Lumpur')::date = d::date), 0)
    from generate_series(p_from, p_to, interval '1 day') d
   order by d;
end $$;

-- ───────────────────────── Scheduled jobs (invoke via pg_cron / Edge Function) ─────────────────────────
create or replace function public.enqueue_appointment_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_service text; v_when text;
begin
  for r in
    select b.*, tp.user_id as therapist_user_id
      from public.bookings b
      left join public.therapist_profiles tp on tp.id = b.therapist_id
     where b.status in ('confirmed', 'therapist_assigned')
       and ((b.reminder_24h_sent_at is null and b.scheduled_start between now() + interval '2 hours' and now() + interval '24 hours')
         or (b.reminder_2h_sent_at is null and b.scheduled_start between now() and now() + interval '2 hours'))
  loop
    select name into v_service from public.services where id = r.service_id;
    v_when := to_char(r.scheduled_start at time zone 'Asia/Kuala_Lumpur', 'DD Mon, HH12:MI AM');
    perform public.notify(r.patient_user_id, 'appointment_reminder', 'Appointment reminder',
      v_service || ' on ' || v_when || '.', jsonb_build_object('booking_id', r.id));
    perform public.notify(r.therapist_user_id, 'appointment_reminder', 'Upcoming appointment',
      v_service || ' on ' || v_when || '.', jsonb_build_object('booking_id', r.id));
    if r.scheduled_start <= now() + interval '2 hours' then
      update public.bookings set reminder_2h_sent_at = now(), reminder_24h_sent_at = coalesce(reminder_24h_sent_at, now()) where id = r.id;
    else
      update public.bookings set reminder_24h_sent_at = now() where id = r.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.enqueue_package_expiry_notices() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  update public.package_purchases set status = 'expired'
   where status = 'active' and expires_at <= now();
  for r in
    select pp.id, pp.user_id, pp.sessions_remaining, pp.expires_at, pk.name
      from public.package_purchases pp join public.packages pk on pk.id = pp.package_id
     where pp.status = 'active' and pp.sessions_remaining > 0 and pp.expiry_notice_sent_at is null
       and pp.expires_at <= now() + interval '7 days'
  loop
    perform public.notify(r.user_id, 'package_expiry', 'Your package expires soon',
      r.sessions_remaining || ' session(s) left on ' || r.name || ' — expires ' ||
      to_char(r.expires_at at time zone 'Asia/Kuala_Lumpur', 'DD Mon YYYY') || '.',
      jsonb_build_object('package_purchase_id', r.id));
    update public.package_purchases set expiry_notice_sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ===== supabase/migrations/20260115000006_row_level_security.sql =====
-- ============================================================================
-- BeVital — migration 6: Row Level Security, grants and API surface
-- ============================================================================
-- Model
--   * Every table has RLS enabled. Without a matching policy a row is invisible.
--   * Table privileges are least-privilege: clients get SELECT where needed and DML only
--     on tables they legitimately write to. Bookings, payments, notifications (insert),
--     audit logs and payment ledgers have NO client write access at all — they change only
--     through SECURITY DEFINER RPCs or the service role.
--   * Clinical data (medical records, clinical notes, exercise programmes) is NOT
--     readable by admins. Therapists read health profiles only through the audited RPC
--     therapist_get_patient_health(), and only with the patient's consent.
-- ============================================================================

-- Fix: let a therapist resubmit a rejected credential (rejected → submitted) but nothing else.
create or replace function public.protect_credential_columns() returns trigger
language plpgsql as $$
begin
  if public.is_client_session() and not public.is_admin() then
    if new.therapist_id is distinct from old.therapist_id
       or (new.status is distinct from old.status and not (old.status = 'rejected' and new.status = 'submitted'))
       or new.review_notes is distinct from old.review_notes
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'BV_FORBIDDEN: credential review fields are managed by BeVital' using errcode = '42501';
    end if;
  end if;
  if public.is_admin() and new.status is distinct from old.status then
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;
  return new;
end $$;

-- A patient can see (past) therapists they have booked even if the therapist is later suspended.
create or replace function public.patient_has_booking_with(p_therapist uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings b where b.therapist_id = p_therapist and b.patient_user_id = auth.uid())
$$;

-- ───────────────────────── Enable RLS everywhere ─────────────────────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ───────────────────────── Baseline privileges ─────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Public catalogue (readable without signing in)
grant select on public.system_settings, public.clinics, public.service_lines,
                public.service_categories, public.services to anon, authenticated;

-- Read-only for signed-in users (rows filtered by policy)
grant select on public.therapist_profiles, public.therapist_services, public.therapist_availability,
                public.promotions, public.packages, public.education_articles, public.reviews,
                public.audit_logs, public.package_purchases, public.package_redemptions,
                public.promotion_redemptions, public.payments, public.payment_transactions,
                public.bookings, public.booking_status_transitions, public.booking_status_history,
                public.users, public.patient_profiles, public.treatment_sessions to authenticated;

-- Direct client writes (each guarded by policies and, where noted, protect triggers)
grant insert, update, delete on public.family_members, public.addresses, public.patient_medical_records,
                                public.exercise_programme_items, public.push_tokens,
                                public.therapist_time_off, public.therapist_availability to authenticated;
grant select on public.family_members, public.addresses, public.patient_medical_records,
                public.exercise_programme_items, public.push_tokens, public.therapist_time_off,
                public.therapist_private, public.therapist_credentials, public.consents,
                public.clinical_notes, public.rehabilitation_goals, public.exercise_programmes,
                public.exercise_completions, public.notifications, public.therapist_live_locations to authenticated;
grant update on public.users, public.therapist_profiles, public.patient_profiles to authenticated;
grant insert, update, delete on public.therapist_private, public.therapist_credentials to authenticated;
grant insert, delete on public.therapist_services, public.therapist_live_locations to authenticated;
grant update (latitude, longitude, heading, speed_mps, recorded_at) on public.therapist_live_locations to authenticated;
grant insert, update on public.clinical_notes, public.rehabilitation_goals, public.exercise_programmes to authenticated;
grant insert, delete on public.exercise_completions to authenticated;
grant insert on public.consents, public.reviews to authenticated;
grant update (revoked_at) on public.consents to authenticated;
grant update (pain_score_before, pain_score_after, patient_summary) on public.treatment_sessions to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

-- Admin-managed reference data: authenticated may attempt DML; the admin policies decide.
grant insert, update, delete on public.system_settings, public.clinics, public.service_lines,
                                public.service_categories, public.services, public.promotions,
                                public.packages, public.education_articles to authenticated;
grant update on public.reviews to authenticated;       -- moderation (admin policy only)
grant update on public.payments to authenticated;      -- refund flags (admin policy only, see below)
revoke update on public.payments from authenticated;
grant update (refund_required) on public.payments to authenticated;

-- ───────────────────────── Policies ─────────────────────────

-- users
create policy users_select_self on public.users for select to authenticated using (id = auth.uid());
create policy users_select_admin on public.users for select to authenticated using (public.is_admin());
create policy users_select_treating_therapist on public.users for select to authenticated
  using (role = 'patient' and public.therapist_treats_user(id));
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy users_update_admin on public.users for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- patient_profiles (health-adjacent: owner only)
create policy patient_profiles_select_self on public.patient_profiles for select to authenticated using (user_id = auth.uid());
create policy patient_profiles_update_self on public.patient_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- family_members
create policy family_owner_all on public.family_members for all to authenticated
  using (primary_user_id = auth.uid()) with check (primary_user_id = auth.uid());
create policy family_treating_therapist on public.family_members for select to authenticated
  using (public.therapist_treats_patient(primary_user_id, id));

-- addresses
create policy addresses_owner_all on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- system_settings
create policy settings_public_read on public.system_settings for select to anon, authenticated using (is_public);
create policy settings_admin_all on public.system_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- clinics & catalogue
create policy clinics_read_active on public.clinics for select to anon, authenticated using (is_active);
create policy clinics_admin_all on public.clinics for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy service_lines_read on public.service_lines for select to anon, authenticated using (is_active);
create policy service_lines_admin on public.service_lines for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy service_categories_read on public.service_categories for select to anon, authenticated using (is_active);
create policy service_categories_admin on public.service_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy services_read on public.services for select to anon, authenticated using (is_active);
create policy services_admin on public.services for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- therapist_profiles: only verified therapists are discoverable
create policy therapist_profiles_read on public.therapist_profiles for select to authenticated
  using (verification_status = 'verified' or user_id = auth.uid() or public.is_admin()
         or public.patient_has_booking_with(id));
create policy therapist_profiles_update_self on public.therapist_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy therapist_profiles_update_admin on public.therapist_profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy therapist_private_own on public.therapist_private for all to authenticated
  using (therapist_id = public.my_therapist_id()) with check (therapist_id = public.my_therapist_id());
create policy therapist_private_admin on public.therapist_private for select to authenticated using (public.is_admin());

create policy therapist_services_read on public.therapist_services for select to authenticated
  using (exists (select 1 from public.therapist_profiles tp where tp.id = therapist_id));
create policy therapist_services_insert_own on public.therapist_services for insert to authenticated
  with check (therapist_id = public.my_therapist_id());
create policy therapist_services_delete_own on public.therapist_services for delete to authenticated
  using (therapist_id = public.my_therapist_id());
create policy therapist_services_admin on public.therapist_services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy credentials_select_own on public.therapist_credentials for select to authenticated
  using (therapist_id = public.my_therapist_id());
create policy credentials_insert_own on public.therapist_credentials for insert to authenticated
  with check (therapist_id = public.my_therapist_id() and status = 'submitted');
create policy credentials_update_own on public.therapist_credentials for update to authenticated
  using (therapist_id = public.my_therapist_id() and status in ('submitted', 'rejected'))
  with check (therapist_id = public.my_therapist_id());
create policy credentials_delete_own on public.therapist_credentials for delete to authenticated
  using (therapist_id = public.my_therapist_id() and status in ('submitted', 'rejected'));
create policy credentials_admin on public.therapist_credentials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy availability_read on public.therapist_availability for select to authenticated
  using (exists (select 1 from public.therapist_profiles tp where tp.id = therapist_id));
create policy availability_write_own on public.therapist_availability for all to authenticated
  using (therapist_id = public.my_therapist_id()) with check (therapist_id = public.my_therapist_id());
create policy availability_admin on public.therapist_availability for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy time_off_own on public.therapist_time_off for all to authenticated
  using (therapist_id = public.my_therapist_id()) with check (therapist_id = public.my_therapist_id());
create policy time_off_admin on public.therapist_time_off for select to authenticated using (public.is_admin());

-- commerce reference
create policy promotions_featured_read on public.promotions for select to authenticated
  using (is_active and is_featured and now() >= valid_from and (valid_until is null or now() <= valid_until));
create policy promotions_admin on public.promotions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy packages_read on public.packages for select to authenticated using (is_active);
create policy packages_admin on public.packages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy education_read on public.education_articles for select to authenticated using (is_published);
create policy education_admin on public.education_articles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- consent & audit
create policy consents_select on public.consents for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy consents_insert on public.consents for insert to authenticated with check (user_id = auth.uid());
create policy consents_update on public.consents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- bookings: read-only for clients; all writes via RPC
create policy bookings_patient_read on public.bookings for select to authenticated using (patient_user_id = auth.uid());
create policy bookings_therapist_read on public.bookings for select to authenticated using (therapist_id = public.my_therapist_id());
create policy bookings_admin_read on public.bookings for select to authenticated using (public.is_admin());
create policy transitions_read on public.booking_status_transitions for select to authenticated using (true);
create policy booking_history_read on public.booking_status_history for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

-- live location: real GPS from the therapist device, only while "on the way"
create policy live_loc_therapist on public.therapist_live_locations for all to authenticated
  using (therapist_id = public.my_therapist_id()
         and exists (select 1 from public.bookings b where b.id = booking_id and b.therapist_id = public.my_therapist_id() and b.status = 'on_the_way'))
  with check (therapist_id = public.my_therapist_id()
         and exists (select 1 from public.bookings b where b.id = booking_id and b.therapist_id = public.my_therapist_id() and b.status = 'on_the_way'));
create policy live_loc_patient on public.therapist_live_locations for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.patient_user_id = auth.uid() and b.status = 'on_the_way'));

-- payments: read-only for payers/admins; money state changes only via service role
create policy payments_read on public.payments for select to authenticated using (payer_user_id = auth.uid() or public.is_admin());
create policy payments_admin_flag on public.payments for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy payment_tx_admin on public.payment_transactions for select to authenticated using (public.is_admin());
create policy package_purchases_read on public.package_purchases for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy package_redemptions_read on public.package_redemptions for select to authenticated
  using (exists (select 1 from public.package_purchases pp where pp.id = package_purchase_id));
create policy promotion_redemptions_read on public.promotion_redemptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- clinical data (owner + treating therapist; never admin)
create policy medical_records_owner on public.patient_medical_records for all to authenticated
  using (patient_user_id = auth.uid())
  with check (patient_user_id = auth.uid()
              and (family_member_id is null or exists (select 1 from public.family_members f where f.id = family_member_id and f.primary_user_id = auth.uid())));

create policy sessions_read on public.treatment_sessions for select to authenticated
  using (patient_user_id = auth.uid() or therapist_id = public.my_therapist_id());
create policy sessions_update_therapist on public.treatment_sessions for update to authenticated
  using (therapist_id = public.my_therapist_id()) with check (therapist_id = public.my_therapist_id());

create policy notes_therapist_read on public.clinical_notes for select to authenticated using (therapist_id = public.my_therapist_id());
create policy notes_patient_read on public.clinical_notes for select to authenticated
  using (patient_user_id = auth.uid() and share_with_patient);
create policy notes_therapist_insert on public.clinical_notes for insert to authenticated
  with check (therapist_id = public.my_therapist_id()
              and public.therapist_treats_patient(patient_user_id, family_member_id)
              -- NB: outer-row columns are table-qualified; an unqualified name would bind to the
              -- subquery's own bookings columns and turn this check into a tautology.
              and exists (select 1 from public.bookings b
                           where b.id = clinical_notes.booking_id
                             and b.therapist_id = public.my_therapist_id()
                             and b.patient_user_id = clinical_notes.patient_user_id
                             and b.family_member_id is not distinct from clinical_notes.family_member_id));
create policy notes_therapist_update on public.clinical_notes for update to authenticated
  using (therapist_id = public.my_therapist_id()) with check (therapist_id = public.my_therapist_id());

create policy goals_read on public.rehabilitation_goals for select to authenticated
  using (patient_user_id = auth.uid() or therapist_id = public.my_therapist_id());
create policy goals_therapist_insert on public.rehabilitation_goals for insert to authenticated
  with check (therapist_id = public.my_therapist_id() and public.therapist_treats_patient(patient_user_id, family_member_id));
create policy goals_therapist_update on public.rehabilitation_goals for update to authenticated
  using (therapist_id = public.my_therapist_id()) with check (therapist_id = public.my_therapist_id());

create policy programmes_read on public.exercise_programmes for select to authenticated
  using (patient_user_id = auth.uid() or therapist_id = public.my_therapist_id());
create policy programmes_therapist_insert on public.exercise_programmes for insert to authenticated
  with check (therapist_id = public.my_therapist_id() and public.therapist_treats_patient(patient_user_id, family_member_id));
create policy programmes_therapist_update on public.exercise_programmes for update to authenticated
  using (therapist_id = public.my_therapist_id()) with check (therapist_id = public.my_therapist_id());

create policy programme_items_read on public.exercise_programme_items for select to authenticated
  using (exists (select 1 from public.exercise_programmes p where p.id = programme_id));
create policy programme_items_therapist_write on public.exercise_programme_items for all to authenticated
  using (exists (select 1 from public.exercise_programmes p where p.id = programme_id and p.therapist_id = public.my_therapist_id()))
  with check (exists (select 1 from public.exercise_programmes p where p.id = programme_id and p.therapist_id = public.my_therapist_id()));

create policy completions_patient_read on public.exercise_completions for select to authenticated using (patient_user_id = auth.uid());
create policy completions_therapist_read on public.exercise_completions for select to authenticated
  using (exists (select 1 from public.exercise_programme_items i join public.exercise_programmes p on p.id = i.programme_id
                  where i.id = programme_item_id and p.therapist_id = public.my_therapist_id()));
create policy completions_patient_insert on public.exercise_completions for insert to authenticated
  with check (patient_user_id = auth.uid()
              and exists (select 1 from public.exercise_programme_items i join public.exercise_programmes p on p.id = i.programme_id
                           where i.id = programme_item_id and p.patient_user_id = auth.uid() and p.status = 'active'));
create policy completions_patient_delete on public.exercise_completions for delete to authenticated using (patient_user_id = auth.uid());

-- reviews
create policy reviews_read on public.reviews for select to authenticated
  using (is_published or patient_user_id = auth.uid() or therapist_id = public.my_therapist_id() or public.is_admin());
create policy reviews_insert on public.reviews for insert to authenticated with check (patient_user_id = auth.uid());
create policy reviews_admin_update on public.reviews for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- notifications & push tokens
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy push_tokens_own on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── Function execution surface ─────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;

-- RLS helpers (policies evaluate these as the calling role)
grant execute on function public.auth_role(), public.is_admin(), public.my_therapist_id(),
  public.therapist_treats_user(uuid), public.therapist_treats_patient(uuid, uuid),
  public.therapist_has_record_access(uuid, uuid), public.patient_has_booking_with(uuid),
  public.is_client_session() to anon, authenticated;

-- Client-callable RPCs
grant execute on function
  public.get_available_times(uuid, public.appointment_type, date, uuid, numeric, numeric),
  public.search_available_therapists(uuid, public.appointment_type, timestamptz, uuid, numeric, numeric),
  public.quote_booking(uuid, public.appointment_type, timestamptz, uuid, numeric, numeric, uuid, text, uuid),
  public.create_booking(uuid, public.appointment_type, timestamptz, uuid, uuid, uuid, uuid, text, uuid, text, text, boolean, numeric),
  public.cancel_booking(uuid, text),
  public.therapist_respond_to_booking(uuid, boolean, text),
  public.update_booking_status(uuid, public.booking_status, text),
  public.admin_assign_therapist(uuid, uuid),
  public.set_booking_record_sharing(uuid, boolean),
  public.initiate_payment(uuid, public.payment_method),
  public.purchase_package(uuid, public.payment_method),
  public.therapist_get_patient_health(uuid),
  public.therapist_earnings_summary(),
  public.admin_dashboard_stats(),
  public.admin_report_timeseries(date, date)
to authenticated;

-- Server-only (webhooks, scheduled jobs)
grant execute on all functions in schema public to service_role;

-- ───────────────────────── Realtime ─────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings, public.notifications, public.therapist_live_locations;
  end if;
end $$;

-- ===== supabase/migrations/20260115000007_storage.sql =====
-- ============================================================================
-- BeVital — migration 7: storage buckets and policies
-- ============================================================================
-- Buckets
--   therapist-photos       PUBLIC read  (professional profile photos shown to patients)
--   exercise-media         PUBLIC read  (generic exercise demonstration media, no patient data)
--   therapist-credentials  PRIVATE      (licences/IDs: therapist owner + admins)
--   medical-documents      PRIVATE      (patient uploads: owner + consented treating therapist)
-- Clinical information is never placed in a public bucket.
-- Object paths always start with the owner's id so policies can verify ownership.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('therapist-photos', 'therapist-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('exercise-media', 'exercise-media', true, 104857600, array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']),
  ('therapist-credentials', 'therapist-credentials', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']),
  ('medical-documents', 'medical-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Parses medical-documents paths: {patient_user_id}/{family_member_id | 'self'}/{file}
create or replace function public.therapist_can_read_medical_doc(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_parts text[] := string_to_array(p_name, '/');
begin
  if array_length(v_parts, 1) < 3 then return false; end if;
  if v_parts[1] !~ '^[0-9a-f-]{36}$' then return false; end if;
  if v_parts[2] <> 'self' and v_parts[2] !~ '^[0-9a-f-]{36}$' then return false; end if;
  return public.therapist_has_record_access(
    v_parts[1]::uuid,
    case when v_parts[2] = 'self' then null else v_parts[2]::uuid end);
end $$;
revoke execute on function public.therapist_can_read_medical_doc(text) from public, anon;
grant execute on function public.therapist_can_read_medical_doc(text) to authenticated, service_role;

-- therapist-photos
create policy "therapist photos: public read" on storage.objects for select
  using (bucket_id = 'therapist-photos');
create policy "therapist photos: owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'therapist-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "therapist photos: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'therapist-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "therapist photos: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'therapist-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- exercise-media
create policy "exercise media: public read" on storage.objects for select
  using (bucket_id = 'exercise-media');
create policy "exercise media: staff write" on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-media' and public.auth_role() in ('therapist', 'admin')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exercise media: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-media' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

-- therapist-credentials (private)
create policy "credentials: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'therapist-credentials' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "credentials: admin read" on storage.objects for select to authenticated
  using (bucket_id = 'therapist-credentials' and public.is_admin());
create policy "credentials: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'therapist-credentials' and public.auth_role() = 'therapist'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "credentials: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'therapist-credentials' and (storage.foldername(name))[1] = auth.uid()::text);

-- medical-documents (private; admins have NO access)
create policy "medical docs: owner all" on storage.objects for all to authenticated
  using (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "medical docs: consented therapist read" on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and public.therapist_can_read_medical_doc(name));

-- ===== supabase/seed.sql =====
-- ============================================================================
-- BeVital — reference seed (safe for every environment)
-- ============================================================================
-- Service catalogue + platform settings. No people, no clinics, no promotions.
-- ⚠️  PRICES BELOW ARE PLACEHOLDERS. BeVital must set real prices (Admin → Pricing).
-- Idempotent: re-running updates catalogue rows by slug and never touches settings
-- an admin has already changed.
-- ============================================================================

insert into public.service_lines (slug, name, provider_title, is_active, sort_order)
values ('physiotherapy', 'Physiotherapy', 'Physiotherapist', true, 1)
on conflict (slug) do update set name = excluded.name, is_active = excluded.is_active;

insert into public.service_categories (service_line_id, slug, name, description, icon, sort_order)
select l.id, c.slug, c.name, c.description, c.icon, c.sort_order
from public.service_lines l,
(values
  ('musculoskeletal',   'Musculoskeletal Physiotherapy',  'Assessment and treatment of muscle, joint, ligament and tendon problems.', 'body', 1),
  ('sports-injury',     'Sports Injury Rehabilitation',   'Recover from sports injuries and return to play safely.', 'fitness', 2),
  ('post-operative',    'Post-Operative Rehabilitation',  'Structured rehabilitation after orthopaedic and other surgery.', 'bandage', 3),
  ('stroke',            'Stroke Rehabilitation',          'Regain movement, balance and independence after a stroke.', 'pulse', 4),
  ('neurological',      'Neurological Rehabilitation',    'Physiotherapy for Parkinson''s disease, MS, spinal cord and other neurological conditions.', 'git-network', 5),
  ('paediatric',        'Paediatric Physiotherapy',       'Gentle, play-based physiotherapy for infants and children.', 'happy', 6),
  ('geriatric',         'Geriatric Physiotherapy',        'Mobility, strength and falls prevention for older adults.', 'walk', 7),
  ('womens-health',     'Women''s Health Physiotherapy',  'Pelvic health, pregnancy-related and postnatal physiotherapy.', 'flower', 8),
  ('chronic-pain',      'Chronic Pain Management',        'Long-term pain strategies combining movement, education and manual therapy.', 'medkit', 9),
  ('spine-posture',     'Spine and Posture Rehabilitation','Neck and back pain, posture correction and spinal stability.', 'accessibility', 10),
  ('home-physiotherapy','Home Physiotherapy',             'Professional physiotherapy delivered at your home.', 'home', 11),
  ('workplace',         'Workplace Physiotherapy',        'On-site ergonomic assessment and injury prevention for you or your team.', 'briefcase', 12)
) as c(slug, name, description, icon, sort_order)
where l.slug = 'physiotherapy'
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, icon = excluded.icon, sort_order = excluded.sort_order;

-- (category, slug, name, description, conditions, objectives, minutes, clinic?, home?, clinic price, home price, order)
insert into public.services (category_id, slug, name, description, conditions_treated, treatment_objectives,
                             duration_minutes, supports_clinic, supports_home, price_clinic, price_home, sort_order)
select cat.id, s.slug, s.name, s.description, s.conditions, s.objectives,
       s.minutes, s.clinic, s.home, s.price_clinic, s.price_home, s.sort_order
from public.service_categories cat
join (values
  ('musculoskeletal', 'msk-assessment', 'Musculoskeletal Assessment & Treatment',
   'A full assessment of your pain or movement problem followed by hands-on treatment and a personalised plan.',
   array['Neck pain','Shoulder pain','Tennis / golfer''s elbow','Knee osteoarthritis','Ankle sprain','Muscle strains'],
   array['Reduce pain','Restore range of motion','Build strength and control','Prevent recurrence'],
   60, true, true, 150.00, 220.00, 1),
  ('musculoskeletal', 'msk-followup', 'Musculoskeletal Follow-up Session',
   'Continue your treatment plan with progressive manual therapy and exercise.',
   array['Ongoing joint pain','Muscle and tendon injuries'],
   array['Progress your exercise programme','Maintain pain relief','Improve function'],
   45, true, true, 110.00, 170.00, 2),

  ('sports-injury', 'sports-assessment', 'Sports Injury Assessment',
   'Targeted assessment for acute and overuse sports injuries with an early-recovery plan.',
   array['Ligament sprains','Hamstring and calf strains','Runner''s knee','Tendinopathy','Shoulder instability'],
   array['Control pain and swelling','Protect healing tissue','Maintain fitness during recovery'],
   60, true, true, 160.00, 230.00, 1),
  ('sports-injury', 'sports-return', 'Return-to-Sport Rehabilitation',
   'Progressive strength, agility and sport-specific loading to return to training with confidence.',
   array['Post-injury return to play','Recurrent sports injuries'],
   array['Restore strength and power','Re-train sport-specific movement','Lower re-injury risk'],
   60, true, false, 140.00, null, 2),

  ('post-operative', 'postop-assessment', 'Post-Operative Rehabilitation Assessment',
   'Assessment after surgery and a staged rehabilitation plan agreed with your surgeon''s guidance.',
   array['Knee or hip replacement','ACL reconstruction','Rotator cuff repair','Fracture fixation','Spinal surgery'],
   array['Manage pain and swelling','Restore safe movement','Return to daily activities'],
   60, true, true, 160.00, 230.00, 1),
  ('post-operative', 'postop-followup', 'Post-Operative Follow-up Session',
   'Progress your post-surgical rehabilitation with graded exercise and mobility work.',
   array['Ongoing post-surgical recovery'],
   array['Improve range of motion','Rebuild strength','Normalise walking and function'],
   45, true, true, 120.00, 180.00, 2),

  ('stroke', 'stroke-assessment', 'Stroke Rehabilitation Assessment',
   'Comprehensive assessment of movement, balance and function after a stroke.',
   array['Hemiparesis','Balance problems','Reduced hand and arm function','Walking difficulty'],
   array['Set recovery goals with you and your family','Plan a safe home programme'],
   75, true, true, 180.00, 250.00, 1),
  ('stroke', 'stroke-session', 'Stroke Rehabilitation Session',
   'Task-focused neuro-rehabilitation to improve walking, balance and arm use.',
   array['Post-stroke weakness','Spasticity','Gait re-training'],
   array['Improve mobility and independence','Reduce fall risk','Support caregivers'],
   60, true, true, 150.00, 220.00, 2),

  ('neurological', 'neuro-assessment', 'Neurological Physiotherapy Assessment',
   'Specialist assessment for people living with neurological conditions.',
   array['Parkinson''s disease','Multiple sclerosis','Spinal cord injury','Bell''s palsy','Peripheral neuropathy'],
   array['Identify movement priorities','Plan safe, effective therapy'],
   75, true, true, 180.00, 250.00, 1),
  ('neurological', 'neuro-session', 'Neurological Rehabilitation Session',
   'Individualised therapy to support balance, mobility and everyday function.',
   array['Movement disorders','Balance impairment','Neurological weakness'],
   array['Maintain and improve mobility','Reduce falls','Support independence'],
   60, true, true, 150.00, 220.00, 2),

  ('paediatric', 'paeds-assessment', 'Paediatric Physiotherapy Assessment',
   'Child-friendly assessment of development, posture and movement with parents involved throughout.',
   array['Developmental delay','Cerebral palsy','Torticollis','Toe walking','Flat feet concerns'],
   array['Understand your child''s needs','Set family-centred goals'],
   60, true, true, 150.00, 220.00, 1),
  ('paediatric', 'paeds-session', 'Paediatric Therapy Session',
   'Play-based therapy that builds strength, coordination and confidence.',
   array['Gross motor delay','Neuromuscular conditions'],
   array['Achieve motor milestones','Teach parents home activities'],
   45, true, true, 120.00, 180.00, 2),

  ('geriatric', 'geri-assessment', 'Geriatric Physiotherapy Assessment',
   'Whole-person assessment of strength, balance, mobility and falls risk.',
   array['Frailty','Osteoarthritis','Falls history','Reduced mobility','Osteoporosis'],
   array['Identify falls risk','Plan a safe, achievable programme'],
   60, true, true, 140.00, 210.00, 1),
  ('geriatric', 'geri-falls', 'Falls Prevention & Mobility Session',
   'Balance, strength and walking practice to keep you independent and steady.',
   array['Balance problems','Leg weakness','Fear of falling'],
   array['Improve balance','Build leg strength','Boost confidence moving around'],
   45, true, true, 110.00, 170.00, 2),

  ('womens-health', 'womens-assessment', 'Women''s Health Physiotherapy Assessment',
   'Private, sensitive assessment for pelvic health and pregnancy-related concerns.',
   array['Pelvic floor weakness','Pregnancy back and pelvic pain','Diastasis recti','Postnatal recovery'],
   array['Understand the cause','Teach safe pelvic floor and core strategies'],
   60, true, true, 170.00, 240.00, 1),
  ('womens-health', 'womens-postnatal', 'Postnatal Recovery Session',
   'Gradual rebuilding of core, pelvic floor and posture after childbirth.',
   array['Postnatal back pain','Core weakness','Return to exercise'],
   array['Restore core and pelvic floor function','Return to activity safely'],
   45, true, true, 130.00, 190.00, 2),

  ('chronic-pain', 'pain-assessment', 'Chronic Pain Assessment',
   'A thorough review of your pain, activity and sleep to build a long-term management plan.',
   array['Persistent back pain','Fibromyalgia','Chronic neck pain','Post-injury persistent pain'],
   array['Explain your pain','Set realistic function goals'],
   60, true, true, 160.00, 230.00, 1),
  ('chronic-pain', 'pain-session', 'Chronic Pain Management Session',
   'Graded activity, manual therapy and pain education to help you do more with less pain.',
   array['Ongoing persistent pain'],
   array['Increase activity tolerance','Reduce flare-ups','Improve confidence'],
   45, true, true, 120.00, 180.00, 2),

  ('spine-posture', 'spine-assessment', 'Spine & Posture Assessment',
   'Assessment of neck, back and posture with an ergonomic and exercise plan.',
   array['Lower back pain','Neck and upper back pain','Sciatica','Poor posture','Disc-related pain'],
   array['Relieve pain','Correct movement and posture habits'],
   60, true, true, 150.00, 220.00, 1),
  ('spine-posture', 'spine-session', 'Spine Rehabilitation Session',
   'Stabilisation, mobility and manual therapy to restore a healthy, strong spine.',
   array['Recurrent back pain','Post-disc injury recovery'],
   array['Build spinal stability','Improve mobility','Prevent recurrence'],
   45, true, true, 110.00, 170.00, 2),

  ('home-physiotherapy', 'home-assessment', 'Home Physiotherapy Assessment',
   'Your physiotherapist visits your home, assesses you in your own environment and starts treatment.',
   array['Reduced mobility','Post-surgery recovery at home','Chronic conditions','Elderly care'],
   array['Treat you where you are most comfortable','Adapt your home set-up and exercises'],
   60, false, true, null, 220.00, 1),
  ('home-physiotherapy', 'home-followup', 'Home Physiotherapy Follow-up',
   'Follow-up treatment and exercise progression at home.',
   array['Ongoing rehabilitation at home'],
   array['Continue your treatment plan','Progress your exercises safely'],
   45, false, true, null, 170.00, 2),

  ('workplace', 'workplace-ergonomic', 'Workplace Ergonomic Assessment',
   'On-site assessment of your workstation and work habits with practical recommendations.',
   array['Desk-related neck and back pain','Repetitive strain','Poor workstation set-up'],
   array['Reduce strain','Improve workstation set-up','Teach micro-break exercises'],
   60, false, true, null, 250.00, 1),
  ('workplace', 'workplace-session', 'Workplace Physiotherapy Session',
   'On-site treatment and advice for work-related aches and strains.',
   array['Work-related musculoskeletal pain'],
   array['Relieve symptoms at work','Keep you productive and comfortable'],
   45, false, true, null, 190.00, 2)
) as s(category_slug, slug, name, description, conditions, objectives, minutes, clinic, home, price_clinic, price_home, sort_order)
  on s.category_slug = cat.slug
on conflict (slug) do update
  set name = excluded.name, description = excluded.description,
      conditions_treated = excluded.conditions_treated, treatment_objectives = excluded.treatment_objectives,
      duration_minutes = excluded.duration_minutes, supports_clinic = excluded.supports_clinic,
      supports_home = excluded.supports_home, sort_order = excluded.sort_order;
-- note: prices are intentionally NOT overwritten on re-seed so admin pricing changes survive.

-- Platform settings. `is_public` keys are readable by the apps (never put secrets here).
insert into public.system_settings (key, value, description, is_public) values
  ('timezone',                    '"Asia/Kuala_Lumpur"', 'Business timezone for working hours and reporting', true),
  ('slot_interval_minutes',       '30',   'Granularity of bookable start times', true),
  ('min_notice_minutes',          '120',  'Minimum notice before an appointment can start', true),
  ('max_advance_days',            '60',   'How far ahead patients can book', true),
  ('free_cancellation_hours',     '24',   'Cancelling later than this is flagged as a late cancellation', true),
  ('payment_hold_minutes',        '15',   'How long an unpaid booking holds its slot', false),
  ('home_visit_buffer_minutes',   '30',   'Travel buffer after a home visit (therapist unavailable)', false),
  ('clinic_buffer_minutes',       '0',    'Turnaround buffer after a clinic session', false),
  ('travel_fee_free_km',          '3',    'Home-visit distance included at no travel fee', true),
  ('travel_fee_base',             '5',    'Travel fee once beyond the free distance (RM)', true),
  ('travel_fee_per_km',           '1.5',  'Additional travel fee per km beyond the free distance (RM)', true),
  ('travel_fee_max',              '60',   'Maximum travel fee (RM)', true),
  ('travel_distance_factor',      '1.3',  'Multiplier turning straight-line distance into an estimated road distance, until a routing provider is connected', false),
  ('platform_fee',                '3',    'Booking fee added to each paid appointment (RM)', true),
  ('platform_commission_rate',    '0.20', 'Share of (service + travel) retained by BeVital; remainder is therapist earnings', false),
  ('payment_provider',            '"unconfigured"', 'Active payment provider id; "unconfigured" disables checkout', true)
on conflict (key) do nothing;


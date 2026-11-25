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

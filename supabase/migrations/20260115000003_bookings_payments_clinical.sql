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

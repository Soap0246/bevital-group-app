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

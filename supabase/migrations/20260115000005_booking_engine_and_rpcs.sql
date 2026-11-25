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

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

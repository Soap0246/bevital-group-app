-- ============================================================================
-- BeVital — migration 8: public trust facts about physiotherapists
-- ============================================================================
-- Patients choosing a physiotherapist see their professional registration number and how many
-- sessions they have completed. Credentials are private (RLS), so this SECURITY DEFINER function
-- exposes ONLY the registration number of an admin-approved council registration for verified,
-- bookable therapists, plus a completed-session count. Nothing else leaks.
-- ============================================================================
create or replace function public.therapist_public_stats(p_ids uuid[])
returns table (therapist_id uuid, registration_number text, completed_sessions int)
language sql stable security definer set search_path = public as $$
  select tp.id,
         (select c.credential_number
            from public.therapist_credentials c
           where c.therapist_id = tp.id
             and c.credential_type = 'mahpc_registration'
             and c.status = 'approved'
             and c.credential_number is not null
           order by c.reviewed_at desc nulls last
           limit 1),
         (select count(*)::int from public.bookings b where b.therapist_id = tp.id and b.status = 'completed')
    from public.therapist_profiles tp
   where tp.id = any (p_ids)
     and tp.verification_status = 'verified'
     and auth.uid() is not null;
$$;

revoke all on function public.therapist_public_stats(uuid[]) from public, anon;
grant execute on function public.therapist_public_stats(uuid[]) to authenticated;

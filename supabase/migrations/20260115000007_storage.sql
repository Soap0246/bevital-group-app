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

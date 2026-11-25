-- ============================================================================
-- BeVital — DEMO seed for the hosted TEST project (no admin account). SYNTHETIC DATA ONLY.
-- ============================================================================
-- ⚠️  Do NOT run against production. Every person, clinic, address, phone number and
--     record below is fictional and exists only so the apps can be exercised locally.
--     Emails use the reserved ".test" TLD. Clinics/addresses are not real locations.
--     Shared dev password for all accounts:  BevitalDev#2026
-- No reviews or bookings are fabricated here: ratings and history must come from real use.
-- ============================================================================

-- ───────────────────────── Demo clinics ─────────────────────────
insert into public.clinics (id, name, address_line1, city, state, postcode, latitude, longitude, phone, opening_hours) values
  ('c0000000-0000-4000-8000-000000000001', 'BeVital Demo Clinic - Kuala Lumpur', '1 Jalan Contoh (demo address)', 'Kuala Lumpur', 'Wilayah Persekutuan Kuala Lumpur', '50450', 3.157000, 101.712300, '+60300000001',
   '{"mon-fri":"09:00-18:00","sat":"09:00-14:00"}'),
  ('c0000000-0000-4000-8000-000000000002', 'BeVital Demo Clinic - Petaling Jaya', '2 Jalan Contoh (demo address)', 'Petaling Jaya', 'Selangor', '47800', 3.107300, 101.606700, '+60300000002',
   '{"mon-fri":"09:00-18:00","sat":"09:00-14:00"}')
on conflict (id) do nothing;

-- ───────────────────────── Demo auth users ─────────────────────────
do $$
declare r record;
begin
  for r in select * from (values
    ('00000000-0000-4000-8000-000000000101'::uuid, 'patient1@dev.bevital.test',   'Demo Patient One',         'patient'),
    ('00000000-0000-4000-8000-000000000102'::uuid, 'patient2@dev.bevital.test',   'Demo Patient Two',         'patient'),
    ('00000000-0000-4000-8000-000000000201'::uuid, 'therapist1@dev.bevital.test', 'Demo Physio Aisha',        'therapist'),
    ('00000000-0000-4000-8000-000000000202'::uuid, 'therapist2@dev.bevital.test', 'Demo Physio Daniel',       'therapist'),
    ('00000000-0000-4000-8000-000000000203'::uuid, 'therapist3@dev.bevital.test', 'Demo Physio Mei Ling',     'therapist'),
    ('00000000-0000-4000-8000-000000000204'::uuid, 'therapist4@dev.bevital.test', 'Demo Physio Raj',          'therapist'),
    ('00000000-0000-4000-8000-000000000205'::uuid, 'therapist5@dev.bevital.test', 'Demo Physio (Unverified)', 'therapist')
  ) as t(id, email, full_name, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) values (
      '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
      extensions.crypt('BevitalDev#2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', r.full_name, 'role', case when r.role = 'therapist' then 'therapist' else 'patient' end),
      now(), now(), '', '', '', '', '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), r.id,
            jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
            'email', r.id::text, now(), now(), now())
    on conflict do nothing;
  end loop;
end $$;

update public.users set phone = '+60120000101' where email = 'patient1@dev.bevital.test';
update public.users set phone = '+60120000102' where email = 'patient2@dev.bevital.test';

-- ───────────────────────── Demo patient data ─────────────────────────
update public.patient_profiles set
  date_of_birth = date '1985-04-12', gender = 'female', occupation = 'Office worker (demo)',
  emergency_contact_name = 'Demo Contact', emergency_contact_phone = '+60120000999', emergency_contact_relationship = 'Spouse'
where user_id = '00000000-0000-4000-8000-000000000101';

insert into public.addresses (id, user_id, label, line1, city, state, postcode, latitude, longitude, is_default, access_notes) values
  ('a0000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000101', 'Home',
   '10 Jalan Demo (demo address)', 'Kuala Lumpur', 'Wilayah Persekutuan Kuala Lumpur', '50450', 3.149000, 101.700000, true, 'Guardhouse at the entrance (demo)')
on conflict (id) do nothing;

insert into public.family_members (id, primary_user_id, full_name, relationship, date_of_birth, gender, consent_basis, consent_granted_at) values
  ('f0000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000101', 'Demo Child', 'child', date '2016-09-01', 'male', 'guardian_of_minor', now()),
  ('f0000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000101', 'Demo Parent', 'parent', date '1955-02-20', 'female', 'authorised_representative', now())
on conflict (id) do nothing;

insert into public.patient_medical_records (patient_user_id, record_type, title, description, severity) values
  ('00000000-0000-4000-8000-000000000101', 'condition', 'Lower back stiffness (demo)', 'Synthetic example record for development.', 'mild'),
  ('00000000-0000-4000-8000-000000000101', 'allergy', 'No known drug allergies (demo)', null, null)
on conflict do nothing;

-- ───────────────────────── Demo therapists ─────────────────────────
update public.therapist_profiles tp set
  headline = v.headline, bio = v.bio, years_experience = v.years, qualifications = v.quals, languages = v.langs,
  clinic_id = v.clinic, offers_clinic_visits = v.clinic_ok, offers_home_visits = v.home_ok,
  service_radius_km = v.radius, verification_status = v.status
from (values
  ('therapist1@dev.bevital.test', 'Musculoskeletal & sports specialist', 'Demo profile. Helps office workers and active adults recover from pain and injury.', 9,
   array['BSc Physiotherapy (demo)','Certified manual therapist (demo)'], array['English','Bahasa Malaysia'], 'c0000000-0000-4000-8000-000000000001'::uuid, true,  true,  15.0, 'verified'::public.verification_status),
  ('therapist2@dev.bevital.test', 'Paediatric & women''s health', 'Demo profile. Gentle, family-centred care.', 6,
   array['BSc Physiotherapy (demo)'], array['English','Mandarin','Bahasa Malaysia'], 'c0000000-0000-4000-8000-000000000002'::uuid, true,  true,  12.0, 'verified'),
  ('therapist3@dev.bevital.test', 'Neuro & post-operative rehabilitation', 'Demo profile. Stroke, Parkinson''s and post-surgical recovery.', 12,
   array['MSc Neurological Physiotherapy (demo)'], array['English','Mandarin','Cantonese'], 'c0000000-0000-4000-8000-000000000001'::uuid, true,  true,  20.0, 'verified'),
  ('therapist4@dev.bevital.test', 'Home & geriatric physiotherapy', 'Demo profile. Visits patients at home across the Klang Valley.', 15,
   array['BSc Physiotherapy (demo)','Geriatric care certificate (demo)'], array['English','Tamil','Bahasa Malaysia'], null, false, true, 25.0, 'verified'),
  ('therapist5@dev.bevital.test', null, null, null, array[]::text[], array[]::text[], null, true, false, 15.0, 'pending')
) as v(email, headline, bio, years, quals, langs, clinic, clinic_ok, home_ok, radius, status)
join public.users u on u.email = v.email
where tp.user_id = u.id;

insert into public.therapist_private (therapist_id, base_latitude, base_longitude)
select tp.id, v.lat, v.lng
from (values
  ('therapist1@dev.bevital.test', 3.139000::numeric, 101.687000::numeric),
  ('therapist2@dev.bevital.test', 3.107000, 101.607000),
  ('therapist3@dev.bevital.test', 3.157000, 101.712000),
  ('therapist4@dev.bevital.test', 3.130000, 101.680000)
) as v(email, lat, lng)
join public.users u on u.email = v.email
join public.therapist_profiles tp on tp.user_id = u.id
on conflict (therapist_id) do nothing;

-- Services each demo therapist offers (by category)
insert into public.therapist_services (therapist_id, service_id)
select tp.id, s.id
from (values
  ('therapist1@dev.bevital.test', array['musculoskeletal','sports-injury','spine-posture','manual-therapy','exercise-therapy','electrotherapy','post-operative']),
  ('therapist2@dev.bevital.test', array['musculoskeletal','manual-therapy','exercise-therapy','spine-posture','electrotherapy']),
  ('therapist3@dev.bevital.test', array['neurological','exercise-therapy','post-operative','manual-therapy']),
  ('therapist4@dev.bevital.test', array['neurological','musculoskeletal','exercise-therapy','spine-posture','manual-therapy'])
) as v(email, cats)
join public.users u on u.email = v.email
join public.therapist_profiles tp on tp.user_id = u.id
join public.service_categories c on c.slug = any (v.cats)
join public.services s on s.category_id = c.id
on conflict do nothing;

-- Weekly working hours (ISO day: 1 = Monday ... 7 = Sunday)
insert into public.therapist_availability (therapist_id, day_of_week, start_time, end_time, location_type)
select tp.id, d, v.start_time::time, v.end_time::time, v.loc
from (values
  ('therapist1@dev.bevital.test', array[1,2,3,4,5], '09:00', '17:00', 'both'),
  ('therapist2@dev.bevital.test', array[2,3,4,5,6], '10:00', '18:00', 'both'),
  ('therapist3@dev.bevital.test', array[1,3,5],     '08:00', '14:00', 'both'),
  ('therapist4@dev.bevital.test', array[1,2,3,4,5,6,7], '08:00', '20:00', 'home')
) as v(email, days, start_time, end_time, loc)
join public.users u on u.email = v.email
join public.therapist_profiles tp on tp.user_id = u.id
cross join lateral unnest(v.days) as d
where not exists (select 1 from public.therapist_availability a where a.therapist_id = tp.id);

-- ───────────────────────── Packages, promotions, education (demo) ─────────────────────────
insert into public.packages (id, name, description, session_count, price, validity_days, sort_order) values
  ('b0000000-0000-4000-8000-000000000001', '5-Session Recovery Pack (demo price)', 'Five physiotherapy sessions for any service. Use within 6 months.', 5, 550.00, 180, 1),
  ('b0000000-0000-4000-8000-000000000002', '10-Session Recovery Pack (demo price)', 'Ten physiotherapy sessions for any service. Use within 9 months.', 10, 1000.00, 270, 2)
on conflict (id) do nothing;

insert into public.promotions (code, title, description, discount_type, discount_value, max_discount, min_spend, valid_until, usage_limit, per_user_limit, is_featured) values
  ('WELCOME10', 'Welcome offer: 10% off your first session', 'Applies to the service fee. Demo promotion.', 'percent', 10, 30.00, 0, now() + interval '1 year', null, 1, true),
  ('HOMEFIRST', 'RM20 off your first home visit', 'Minimum spend RM150. Demo promotion.', 'fixed', 20, null, 150, now() + interval '1 year', 500, 1, true)
on conflict (code) do nothing;

insert into public.education_articles (slug, title, summary, body, category, reading_minutes, is_published, published_at) values
  ('desk-posture-habits', 'Five desk habits that ease neck and back strain',
   'Small changes to how you sit and move through the workday.',
   E'General information only — not a substitute for assessment by a physiotherapist.\n\n1. Change position every 30–45 minutes.\n2. Keep your screen at eye level and an arm''s length away.\n3. Support your lower back and keep feet flat.\n4. Take short movement breaks: stand, walk, and gently stretch.\n5. Seek assessment if pain persists, spreads, or comes with numbness or weakness.\n\n(DEV content — pending BeVital clinical review before release.)',
   'Posture', 3, true, now()),
  ('preventing-falls-at-home', 'Preventing falls at home',
   'Practical ways to keep older family members safe and steady.',
   E'General information only.\n\n• Remove loose rugs and clutter from walkways.\n• Make sure hallways and stairs are well lit.\n• Wear supportive, non-slip footwear indoors.\n• Keep regular, gentle strength and balance exercise as advised by your physiotherapist.\n• Talk to a health professional if you or a loved one has had a fall.\n\n(DEV content — pending BeVital clinical review before release.)',
   'Older adults', 3, true, now()),
  ('starting-exercise-safely', 'Starting an exercise programme safely',
   'How to build up gradually after an injury or a long break.',
   E'General information only.\n\n• Start with short, comfortable sessions and increase slowly.\n• Mild muscle soreness can be normal; sharp or worsening pain is not — stop and seek advice.\n• Follow the programme your physiotherapist prescribes and log your sessions.\n\n(DEV content — pending BeVital clinical review before release.)',
   'Rehabilitation', 2, true, now())
on conflict (slug) do nothing;

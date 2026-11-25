-- BeVital TEST PROJECT: replace "Demo ..." labels with natural names so the app reads like a real product.
-- Synthetic data only. Safe to re-run. Does not touch real accounts (matches the *.bevital.test demo emails).

-- Account names (users + therapist display names)
update public.users u set full_name = v.name
from (values
  ('patient1@dev.bevital.test',   'patient@test.com',   'Nurul Huda'),
  ('patient2@dev.bevital.test',   'patient2@test.com',  'Jason Lee'),
  ('therapist1@dev.bevital.test', 'physio@test.com',    'Aisha Rahman'),
  ('therapist2@dev.bevital.test', 'physio2@test.com',   'Daniel Lim'),
  ('therapist3@dev.bevital.test', 'physio3@test.com',   'Mei Ling Tan'),
  ('therapist4@dev.bevital.test', 'physio4@test.com',   'Raj Kumar'),
  ('therapist5@dev.bevital.test', 'physio5@test.com',   'Priya Nair')
) as v(email, short_email, name)
where u.email in (v.email, v.short_email);

update public.therapist_profiles tp set display_name = u.full_name
from public.users u
where u.id = tp.user_id and u.role = 'therapist' and tp.display_name ilike 'Demo%';

-- Therapist profile text: drop "Demo profile." and "(demo)" markers
update public.therapist_profiles set
  bio = nullif(btrim(regexp_replace(coalesce(bio, ''), '^Demo profile\.\s*', '')), ''),
  qualifications = array(select btrim(regexp_replace(q, '\s*\(demo\)', '', 'i')) from unnest(qualifications) as q)
where user_id in (select id from public.users where email like 'therapist%@dev.bevital.test' or email like 'physio%@test.com');

-- Family members of the demo patient
update public.family_members set full_name = 'Adam' where full_name = 'Demo Child';
update public.family_members set full_name = 'Puan Salmah' where full_name = 'Demo Parent';

-- Clinics
update public.clinics set
  name = replace(replace(name, 'BeVital Demo Clinic - ', 'BeVital '), 'BeVital Kuala Lumpur', 'BeVital Kuala Lumpur Clinic'),
  address_line1 = btrim(regexp_replace(address_line1, '\s*\(demo address\)', '', 'i'))
where name like 'BeVital Demo Clinic%' or address_line1 ilike '%(demo address)%';
update public.clinics set name = 'BeVital Petaling Jaya Clinic' where name = 'BeVital Petaling Jaya';

-- Packages and promotions
update public.packages set name = btrim(regexp_replace(name, '\s*\(demo price\)', '', 'i')) where name ilike '%(demo price)%';
update public.promotions set description = btrim(regexp_replace(coalesce(description, ''), '\s*Demo promotion\.', '', 'i')) where description ilike '%Demo promotion%';

-- Patient extras
update public.addresses set
  line1 = btrim(regexp_replace(line1, '\s*\(demo address\)', '', 'i')),
  access_notes = nullif(btrim(regexp_replace(coalesce(access_notes, ''), '\s*\(demo\)', '', 'i')), '')
where line1 ilike '%(demo address)%' or access_notes ilike '%(demo)%';

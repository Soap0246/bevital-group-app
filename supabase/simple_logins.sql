-- TEST PROJECT ONLY: gives the demo accounts short logins. Password for all: 123456
-- Run AFTER seed_demo.sql. Never use on a project with real users.
with m(old_email, new_email) as (values
  ('patient1@dev.bevital.test',   'patient@test.com'),
  ('patient2@dev.bevital.test',   'patient2@test.com'),
  ('therapist1@dev.bevital.test', 'physio@test.com'),
  ('therapist2@dev.bevital.test', 'physio2@test.com'),
  ('therapist3@dev.bevital.test', 'physio3@test.com'),
  ('therapist4@dev.bevital.test', 'physio4@test.com'),
  ('therapist5@dev.bevital.test', 'physio5@test.com')
), u as (
  update auth.users a
     set email = m.new_email,
         encrypted_password = extensions.crypt('123456', extensions.gen_salt('bf'))
    from m where a.email = m.old_email
  returning a.id, a.email
)
update auth.identities i
   set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email))
  from u where i.user_id = u.id;

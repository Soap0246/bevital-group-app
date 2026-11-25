-- BeVital: narrow the service catalogue to physiotherapy treatments only. Safe to re-run.
-- Existing bookings keep their (now hidden) services; nothing is deleted.

insert into public.service_lines (slug, name, provider_title, is_active, sort_order)
values ('physiotherapy', 'Physiotherapy', 'Physiotherapist', true, 1)
on conflict (slug) do update set name = excluded.name, is_active = excluded.is_active;

-- Physiotherapy only. Clinic vs home delivery is chosen when booking (not a separate service).
insert into public.service_categories (service_line_id, slug, name, description, icon, sort_order)
select l.id, c.slug, c.name, c.description, c.icon, c.sort_order
from public.service_lines l,
(values
  ('musculoskeletal', 'Musculoskeletal Physiotherapy',   'Assessment and treatment of muscle, joint, ligament and tendon problems.', 'body', 1),
  ('spine-posture',   'Back, Neck & Posture',            'Neck and back pain, sciatica, posture correction and spinal stability.', 'accessibility', 2),
  ('sports-injury',   'Sports Injury Rehabilitation',    'Recover from sports injuries and return to play safely.', 'fitness', 3),
  ('post-operative',  'Post-Operative Rehabilitation',   'Structured rehabilitation after orthopaedic and other surgery.', 'bandage', 4),
  ('neurological',    'Neurological Rehabilitation',     'Physiotherapy after stroke and for Parkinson''s disease, MS and other neurological conditions.', 'pulse', 5),
  ('manual-therapy',  'Manual Therapy',                  'Hands-on joint mobilisation, soft-tissue techniques and stretching.', 'hand-left', 6),
  ('exercise-therapy','Exercise Therapy',                'Supervised, progressive strengthening, balance and mobility programmes.', 'barbell', 7),
  ('electrotherapy',  'Electrotherapy & Modalities',     'Therapeutic ultrasound, TENS and heat or cold therapy to ease pain and aid healing.', 'flash', 8)
) as c(slug, name, description, icon, sort_order)
where l.slug = 'physiotherapy'
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, icon = excluded.icon,
      sort_order = excluded.sort_order, is_active = true;

-- (category, slug, name, description, conditions, objectives, minutes, clinic?, home?, clinic price, home price, order)
insert into public.services (category_id, slug, name, description, conditions_treated, treatment_objectives,
                             duration_minutes, supports_clinic, supports_home, price_clinic, price_home, sort_order)
select cat.id, s.slug, s.name, s.description, s.conditions, s.objectives,
       s.minutes, s.clinic, s.home, s.price_clinic, s.price_home, s.sort_order
from public.service_categories cat
join (values
  ('musculoskeletal', 'msk-assessment', 'Initial Physiotherapy Assessment',
   'A full assessment of your pain or movement problem, hands-on treatment and a personalised plan.',
   array['Neck pain','Shoulder pain','Tennis / golfer''s elbow','Knee osteoarthritis','Ankle sprain','Muscle strains'],
   array['Find the cause','Reduce pain','Restore range of motion','Agree a treatment plan'],
   60, true, true, 150.00, 220.00, 1),
  ('musculoskeletal', 'msk-followup', 'Physiotherapy Follow-up Session',
   'Continue your treatment plan with progressive manual therapy and exercise.',
   array['Ongoing joint pain','Muscle and tendon injuries'],
   array['Progress your exercise programme','Maintain pain relief','Improve function'],
   45, true, true, 110.00, 170.00, 2),

  ('spine-posture', 'spine-assessment', 'Back & Neck Pain Assessment',
   'Assessment of neck, back and posture with a treatment and exercise plan.',
   array['Lower back pain','Neck and upper back pain','Sciatica','Poor posture','Disc-related pain'],
   array['Relieve pain','Correct movement and posture habits'],
   60, true, true, 150.00, 220.00, 1),
  ('spine-posture', 'spine-session', 'Spine Rehabilitation Session',
   'Stabilisation, mobility and manual therapy to restore a healthy, strong spine.',
   array['Recurrent back pain','Post-disc injury recovery'],
   array['Build spinal stability','Improve mobility','Prevent recurrence'],
   45, true, true, 110.00, 170.00, 2),

  ('sports-injury', 'sports-assessment', 'Sports Injury Assessment',
   'Targeted assessment for acute and overuse sports injuries with an early-recovery plan.',
   array['Ligament sprains','Hamstring and calf strains','Runner''s knee','Tendinopathy','Shoulder instability'],
   array['Control pain and swelling','Protect healing tissue','Maintain fitness during recovery'],
   60, true, true, 160.00, 230.00, 1),
  ('sports-injury', 'sports-return', 'Return-to-Sport Rehabilitation',
   'Progressive strength, agility and sport-specific loading to return to training with confidence.',
   array['Post-injury return to play','Recurrent sports injuries'],
   array['Restore strength and power','Re-train sport-specific movement','Lower re-injury risk'],
   60, true, false, 140.00, null, 2),

  ('post-operative', 'postop-assessment', 'Post-Operative Rehabilitation Assessment',
   'Assessment after surgery and a staged rehabilitation plan that follows your surgeon''s guidance.',
   array['Knee or hip replacement','ACL reconstruction','Rotator cuff repair','Fracture fixation','Spinal surgery'],
   array['Manage pain and swelling','Restore safe movement','Return to daily activities'],
   60, true, true, 160.00, 230.00, 1),
  ('post-operative', 'postop-followup', 'Post-Operative Follow-up Session',
   'Progress your post-surgical rehabilitation with graded exercise and mobility work.',
   array['Ongoing post-surgical recovery'],
   array['Improve range of motion','Rebuild strength','Normalise walking and function'],
   45, true, true, 120.00, 180.00, 2),

  ('neurological', 'neuro-assessment', 'Neurological Physiotherapy Assessment',
   'Assessment of movement, balance and function after a stroke or with a neurological condition.',
   array['Stroke','Parkinson''s disease','Multiple sclerosis','Spinal cord injury','Bell''s palsy'],
   array['Set recovery goals with you and your family','Plan a safe home programme'],
   75, true, true, 180.00, 250.00, 1),
  ('neurological', 'neuro-session', 'Neurological Rehabilitation Session',
   'Task-focused therapy to improve walking, balance, arm use and everyday function.',
   array['Post-stroke weakness','Balance impairment','Gait re-training','Movement disorders'],
   array['Improve mobility and independence','Reduce fall risk','Support caregivers'],
   60, true, true, 150.00, 220.00, 2),

  ('manual-therapy', 'manual-session', 'Manual Therapy Session',
   'Joint mobilisation, soft-tissue release and stretching to ease pain and stiffness.',
   array['Stiff joints','Muscle tightness','Neck and back stiffness','Trigger points'],
   array['Reduce pain and stiffness','Improve joint mobility','Prepare for exercise'],
   45, true, true, 120.00, 180.00, 1),

  ('exercise-therapy', 'exercise-session', 'Therapeutic Exercise Session',
   'One-to-one supervised strengthening, balance and mobility exercises, progressed to your goals.',
   array['Muscle weakness','Deconditioning','Balance problems','Post-injury recovery'],
   array['Build strength and endurance','Improve balance and control','Teach a safe home programme'],
   45, true, true, 110.00, 170.00, 1),

  ('electrotherapy', 'electro-session', 'Electrotherapy & Modalities Session',
   'Therapeutic ultrasound, TENS and heat or cold therapy combined with guided movement.',
   array['Acute and chronic pain','Muscle spasm','Soft-tissue inflammation'],
   array['Ease pain','Reduce swelling and spasm','Support tissue healing'],
   30, true, false, 90.00, null, 1)
) as s(category_slug, slug, name, description, conditions, objectives, minutes, clinic, home, price_clinic, price_home, sort_order)
  on s.category_slug = cat.slug
on conflict (slug) do update
  set category_id = excluded.category_id, name = excluded.name, description = excluded.description,
      conditions_treated = excluded.conditions_treated, treatment_objectives = excluded.treatment_objectives,
      duration_minutes = excluded.duration_minutes, supports_clinic = excluded.supports_clinic,
      supports_home = excluded.supports_home, sort_order = excluded.sort_order, is_active = true;
-- note: prices are intentionally NOT overwritten on re-seed so admin pricing changes survive.

-- Hide the old services/categories that are no longer offered (existing bookings keep their records)
update public.services set is_active = false
where slug in ('stroke-assessment','stroke-session','paeds-assessment','paeds-session','geri-assessment','geri-falls',
               'womens-assessment','womens-postnatal','pain-assessment','pain-session',
               'home-assessment','home-followup','workplace-ergonomic','workplace-session');
update public.service_categories set is_active = false
where slug in ('stroke','paediatric','geriatric','womens-health','chronic-pain','home-physiotherapy','workplace');

-- Offer the services to every existing therapist who has no active service left
insert into public.therapist_services (therapist_id, service_id)
select tp.id, s.id
from public.therapist_profiles tp
cross join public.services s
where s.is_active
  and not exists (select 1 from public.therapist_services ts join public.services s2 on s2.id = ts.service_id
                  where ts.therapist_id = tp.id and s2.is_active)
on conflict do nothing;

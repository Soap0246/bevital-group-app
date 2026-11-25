-- ============================================================================
-- BeVital — reference seed (safe for every environment)
-- ============================================================================
-- Service catalogue + platform settings. No people, no clinics, no promotions.
-- ⚠️  PRICES BELOW ARE PLACEHOLDERS. BeVital must set real prices (Admin → Pricing).
-- Idempotent: re-running updates catalogue rows by slug and never touches settings
-- an admin has already changed.
-- ============================================================================

insert into public.service_lines (slug, name, provider_title, is_active, sort_order)
values ('physiotherapy', 'Physiotherapy', 'Physiotherapist', true, 1)
on conflict (slug) do update set name = excluded.name, is_active = excluded.is_active;

insert into public.service_categories (service_line_id, slug, name, description, icon, sort_order)
select l.id, c.slug, c.name, c.description, c.icon, c.sort_order
from public.service_lines l,
(values
  ('musculoskeletal',   'Musculoskeletal Physiotherapy',  'Assessment and treatment of muscle, joint, ligament and tendon problems.', 'body', 1),
  ('sports-injury',     'Sports Injury Rehabilitation',   'Recover from sports injuries and return to play safely.', 'fitness', 2),
  ('post-operative',    'Post-Operative Rehabilitation',  'Structured rehabilitation after orthopaedic and other surgery.', 'bandage', 3),
  ('stroke',            'Stroke Rehabilitation',          'Regain movement, balance and independence after a stroke.', 'pulse', 4),
  ('neurological',      'Neurological Rehabilitation',    'Physiotherapy for Parkinson''s disease, MS, spinal cord and other neurological conditions.', 'git-network', 5),
  ('paediatric',        'Paediatric Physiotherapy',       'Gentle, play-based physiotherapy for infants and children.', 'happy', 6),
  ('geriatric',         'Geriatric Physiotherapy',        'Mobility, strength and falls prevention for older adults.', 'walk', 7),
  ('womens-health',     'Women''s Health Physiotherapy',  'Pelvic health, pregnancy-related and postnatal physiotherapy.', 'flower', 8),
  ('chronic-pain',      'Chronic Pain Management',        'Long-term pain strategies combining movement, education and manual therapy.', 'medkit', 9),
  ('spine-posture',     'Spine and Posture Rehabilitation','Neck and back pain, posture correction and spinal stability.', 'accessibility', 10),
  ('home-physiotherapy','Home Physiotherapy',             'Professional physiotherapy delivered at your home.', 'home', 11),
  ('workplace',         'Workplace Physiotherapy',        'On-site ergonomic assessment and injury prevention for you or your team.', 'briefcase', 12)
) as c(slug, name, description, icon, sort_order)
where l.slug = 'physiotherapy'
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, icon = excluded.icon, sort_order = excluded.sort_order;

-- (category, slug, name, description, conditions, objectives, minutes, clinic?, home?, clinic price, home price, order)
insert into public.services (category_id, slug, name, description, conditions_treated, treatment_objectives,
                             duration_minutes, supports_clinic, supports_home, price_clinic, price_home, sort_order)
select cat.id, s.slug, s.name, s.description, s.conditions, s.objectives,
       s.minutes, s.clinic, s.home, s.price_clinic, s.price_home, s.sort_order
from public.service_categories cat
join (values
  ('musculoskeletal', 'msk-assessment', 'Musculoskeletal Assessment & Treatment',
   'A full assessment of your pain or movement problem followed by hands-on treatment and a personalised plan.',
   array['Neck pain','Shoulder pain','Tennis / golfer''s elbow','Knee osteoarthritis','Ankle sprain','Muscle strains'],
   array['Reduce pain','Restore range of motion','Build strength and control','Prevent recurrence'],
   60, true, true, 150.00, 220.00, 1),
  ('musculoskeletal', 'msk-followup', 'Musculoskeletal Follow-up Session',
   'Continue your treatment plan with progressive manual therapy and exercise.',
   array['Ongoing joint pain','Muscle and tendon injuries'],
   array['Progress your exercise programme','Maintain pain relief','Improve function'],
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
   'Assessment after surgery and a staged rehabilitation plan agreed with your surgeon''s guidance.',
   array['Knee or hip replacement','ACL reconstruction','Rotator cuff repair','Fracture fixation','Spinal surgery'],
   array['Manage pain and swelling','Restore safe movement','Return to daily activities'],
   60, true, true, 160.00, 230.00, 1),
  ('post-operative', 'postop-followup', 'Post-Operative Follow-up Session',
   'Progress your post-surgical rehabilitation with graded exercise and mobility work.',
   array['Ongoing post-surgical recovery'],
   array['Improve range of motion','Rebuild strength','Normalise walking and function'],
   45, true, true, 120.00, 180.00, 2),

  ('stroke', 'stroke-assessment', 'Stroke Rehabilitation Assessment',
   'Comprehensive assessment of movement, balance and function after a stroke.',
   array['Hemiparesis','Balance problems','Reduced hand and arm function','Walking difficulty'],
   array['Set recovery goals with you and your family','Plan a safe home programme'],
   75, true, true, 180.00, 250.00, 1),
  ('stroke', 'stroke-session', 'Stroke Rehabilitation Session',
   'Task-focused neuro-rehabilitation to improve walking, balance and arm use.',
   array['Post-stroke weakness','Spasticity','Gait re-training'],
   array['Improve mobility and independence','Reduce fall risk','Support caregivers'],
   60, true, true, 150.00, 220.00, 2),

  ('neurological', 'neuro-assessment', 'Neurological Physiotherapy Assessment',
   'Specialist assessment for people living with neurological conditions.',
   array['Parkinson''s disease','Multiple sclerosis','Spinal cord injury','Bell''s palsy','Peripheral neuropathy'],
   array['Identify movement priorities','Plan safe, effective therapy'],
   75, true, true, 180.00, 250.00, 1),
  ('neurological', 'neuro-session', 'Neurological Rehabilitation Session',
   'Individualised therapy to support balance, mobility and everyday function.',
   array['Movement disorders','Balance impairment','Neurological weakness'],
   array['Maintain and improve mobility','Reduce falls','Support independence'],
   60, true, true, 150.00, 220.00, 2),

  ('paediatric', 'paeds-assessment', 'Paediatric Physiotherapy Assessment',
   'Child-friendly assessment of development, posture and movement with parents involved throughout.',
   array['Developmental delay','Cerebral palsy','Torticollis','Toe walking','Flat feet concerns'],
   array['Understand your child''s needs','Set family-centred goals'],
   60, true, true, 150.00, 220.00, 1),
  ('paediatric', 'paeds-session', 'Paediatric Therapy Session',
   'Play-based therapy that builds strength, coordination and confidence.',
   array['Gross motor delay','Neuromuscular conditions'],
   array['Achieve motor milestones','Teach parents home activities'],
   45, true, true, 120.00, 180.00, 2),

  ('geriatric', 'geri-assessment', 'Geriatric Physiotherapy Assessment',
   'Whole-person assessment of strength, balance, mobility and falls risk.',
   array['Frailty','Osteoarthritis','Falls history','Reduced mobility','Osteoporosis'],
   array['Identify falls risk','Plan a safe, achievable programme'],
   60, true, true, 140.00, 210.00, 1),
  ('geriatric', 'geri-falls', 'Falls Prevention & Mobility Session',
   'Balance, strength and walking practice to keep you independent and steady.',
   array['Balance problems','Leg weakness','Fear of falling'],
   array['Improve balance','Build leg strength','Boost confidence moving around'],
   45, true, true, 110.00, 170.00, 2),

  ('womens-health', 'womens-assessment', 'Women''s Health Physiotherapy Assessment',
   'Private, sensitive assessment for pelvic health and pregnancy-related concerns.',
   array['Pelvic floor weakness','Pregnancy back and pelvic pain','Diastasis recti','Postnatal recovery'],
   array['Understand the cause','Teach safe pelvic floor and core strategies'],
   60, true, true, 170.00, 240.00, 1),
  ('womens-health', 'womens-postnatal', 'Postnatal Recovery Session',
   'Gradual rebuilding of core, pelvic floor and posture after childbirth.',
   array['Postnatal back pain','Core weakness','Return to exercise'],
   array['Restore core and pelvic floor function','Return to activity safely'],
   45, true, true, 130.00, 190.00, 2),

  ('chronic-pain', 'pain-assessment', 'Chronic Pain Assessment',
   'A thorough review of your pain, activity and sleep to build a long-term management plan.',
   array['Persistent back pain','Fibromyalgia','Chronic neck pain','Post-injury persistent pain'],
   array['Explain your pain','Set realistic function goals'],
   60, true, true, 160.00, 230.00, 1),
  ('chronic-pain', 'pain-session', 'Chronic Pain Management Session',
   'Graded activity, manual therapy and pain education to help you do more with less pain.',
   array['Ongoing persistent pain'],
   array['Increase activity tolerance','Reduce flare-ups','Improve confidence'],
   45, true, true, 120.00, 180.00, 2),

  ('spine-posture', 'spine-assessment', 'Spine & Posture Assessment',
   'Assessment of neck, back and posture with an ergonomic and exercise plan.',
   array['Lower back pain','Neck and upper back pain','Sciatica','Poor posture','Disc-related pain'],
   array['Relieve pain','Correct movement and posture habits'],
   60, true, true, 150.00, 220.00, 1),
  ('spine-posture', 'spine-session', 'Spine Rehabilitation Session',
   'Stabilisation, mobility and manual therapy to restore a healthy, strong spine.',
   array['Recurrent back pain','Post-disc injury recovery'],
   array['Build spinal stability','Improve mobility','Prevent recurrence'],
   45, true, true, 110.00, 170.00, 2),

  ('home-physiotherapy', 'home-assessment', 'Home Physiotherapy Assessment',
   'Your physiotherapist visits your home, assesses you in your own environment and starts treatment.',
   array['Reduced mobility','Post-surgery recovery at home','Chronic conditions','Elderly care'],
   array['Treat you where you are most comfortable','Adapt your home set-up and exercises'],
   60, false, true, null, 220.00, 1),
  ('home-physiotherapy', 'home-followup', 'Home Physiotherapy Follow-up',
   'Follow-up treatment and exercise progression at home.',
   array['Ongoing rehabilitation at home'],
   array['Continue your treatment plan','Progress your exercises safely'],
   45, false, true, null, 170.00, 2),

  ('workplace', 'workplace-ergonomic', 'Workplace Ergonomic Assessment',
   'On-site assessment of your workstation and work habits with practical recommendations.',
   array['Desk-related neck and back pain','Repetitive strain','Poor workstation set-up'],
   array['Reduce strain','Improve workstation set-up','Teach micro-break exercises'],
   60, false, true, null, 250.00, 1),
  ('workplace', 'workplace-session', 'Workplace Physiotherapy Session',
   'On-site treatment and advice for work-related aches and strains.',
   array['Work-related musculoskeletal pain'],
   array['Relieve symptoms at work','Keep you productive and comfortable'],
   45, false, true, null, 190.00, 2)
) as s(category_slug, slug, name, description, conditions, objectives, minutes, clinic, home, price_clinic, price_home, sort_order)
  on s.category_slug = cat.slug
on conflict (slug) do update
  set name = excluded.name, description = excluded.description,
      conditions_treated = excluded.conditions_treated, treatment_objectives = excluded.treatment_objectives,
      duration_minutes = excluded.duration_minutes, supports_clinic = excluded.supports_clinic,
      supports_home = excluded.supports_home, sort_order = excluded.sort_order;
-- note: prices are intentionally NOT overwritten on re-seed so admin pricing changes survive.

-- Platform settings. `is_public` keys are readable by the apps (never put secrets here).
insert into public.system_settings (key, value, description, is_public) values
  ('timezone',                    '"Asia/Kuala_Lumpur"', 'Business timezone for working hours and reporting', true),
  ('slot_interval_minutes',       '30',   'Granularity of bookable start times', true),
  ('min_notice_minutes',          '120',  'Minimum notice before an appointment can start', true),
  ('max_advance_days',            '60',   'How far ahead patients can book', true),
  ('free_cancellation_hours',     '24',   'Cancelling later than this is flagged as a late cancellation', true),
  ('payment_hold_minutes',        '15',   'How long an unpaid booking holds its slot', false),
  ('home_visit_buffer_minutes',   '30',   'Travel buffer after a home visit (therapist unavailable)', false),
  ('clinic_buffer_minutes',       '0',    'Turnaround buffer after a clinic session', false),
  ('travel_fee_free_km',          '3',    'Home-visit distance included at no travel fee', true),
  ('travel_fee_base',             '5',    'Travel fee once beyond the free distance (RM)', true),
  ('travel_fee_per_km',           '1.5',  'Additional travel fee per km beyond the free distance (RM)', true),
  ('travel_fee_max',              '60',   'Maximum travel fee (RM)', true),
  ('travel_distance_factor',      '1.3',  'Multiplier turning straight-line distance into an estimated road distance, until a routing provider is connected', false),
  ('platform_fee',                '3',    'Booking fee added to each paid appointment (RM)', true),
  ('platform_commission_rate',    '0.20', 'Share of (service + travel) retained by BeVital; remainder is therapist earnings', false),
  ('payment_provider',            '"unconfigured"', 'Active payment provider id; "unconfigured" disables checkout', true)
on conflict (key) do nothing;

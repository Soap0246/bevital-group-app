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

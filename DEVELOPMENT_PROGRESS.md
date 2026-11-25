# BeVital — Development Progress

_Last updated: 2026-11-24 · Release 1 scope: physiotherapy only_

This file is deliberately blunt about what has and has not been **verified**. "Verified" means exercised by an
automated test or a real build in this repository; "Written, unverified" means the code exists and type-checks but
has never run against the real service/device it targets.

## Verification summary

| Check | Result |
|---|---|
| `npm run typecheck` (shared + mobile + admin, TypeScript strict) | ✅ 0 errors |
| `npm run test:shared` (validation, formatting, state-machine helpers) | ✅ 7 / 7 |
| `npm run test:db` — real PostgreSQL (PGlite), all 7 migrations + both seeds | ✅ 74 / 74 |
| ↳ schema & enum/transition parity with TypeScript (10) · booking engine (36) · RLS/security (25) · client↔schema contract (3) | ✅ |
| Mobile app web bundle (`expo export -p web`, Metro resolves every route + shared package) | ✅ builds |
| Admin dashboard production build (`next build`, Next.js 16) | ✅ 21 routes |
| Browser smoke test: splash/onboarding, registration validation, admin sign-in, auth-gate redirects (unauthenticated `/patients`, `/bookings/*`, CSV export → `/login`) | ✅ |
| Contract test mutation-checked (planted bad column / RPC param / relationship hint → test fails) | ✅ |

## NOT verified (read this before relying on anything)

1. **No live Supabase stack was run.** Docker was not running, so PostgREST, GoTrue (auth), Storage, Realtime and
   Edge Functions were never exercised. Database logic (RLS, RPCs, triggers, constraints) is tested on a real
   Postgres engine with Supabase's `auth`/`storage`/roles stubbed. The contract test proves every table, column,
   relationship hint and RPC parameter the apps use exists — but sign-in, email verification links, file uploads
   and realtime have not been run end to end.
2. **The apps were not run on a phone or emulator.** Native-only code (react-native-maps, expo-location live
   tracking, expo-notifications, expo-video, document/image pickers, SecureStore session encryption, expo-print
   PDFs) is type-checked only. The web bundle uses the web fallbacks for maps.
3. **Screens behind sign-in were never rendered** (no backend to sign in to), so their visual design and layout
   at phone/tablet widths are unreviewed. Only splash/onboarding/registration/admin sign-in were seen.
4. **Payments are not live.** No provider account exists. The Billplz-based Edge Functions are written against
   Billplz's documented API/signature scheme but have never run; with no credentials they answer
   "provider not configured" and the app says so. No payment is ever marked successful by the apps (proved in the
   DB tests: only `confirm_payment`, executable by the service role, can do it).
5. **Edge Functions (`create-payment-session`, `payment-webhook`, `send-push`)** syntax-checked only.

## Completed

**Platform / backend (Supabase)**
- 7 migrations: 39 tables (every table from the brief plus `service_lines`, `therapist_services`, `therapist_time_off`,
  `therapist_private`, `rehabilitation_goals`, `exercise_programme_items`, `consents`, `system_settings`, …).
- Row Level Security on every table; least-privilege grants; protected-column triggers (users cannot change role/status;
  therapists cannot self-verify, edit ratings or clinic); append-only audit log with triggers on privileged tables.
- Booking engine in SQL: real availability from schedules − time off − existing bookings (+ home-visit buffer);
  server-side pricing (travel fee by distance, booking fee, promo, package); auto-matching; decline → re-offer to next
  therapist; DB **exclusion constraints** for therapist and patient double-booking; payment hold with lazy expiry;
  data-driven status state machine (9 statuses); status history; notifications.
- Payments: pending → succeeded only via service-role `confirm_payment` (amount check, idempotent, receipt number,
  ledger); refund flagging on cancellation.
- Clinical privacy: therapists read health profiles only via audited, consent-checked `therapist_get_patient_health`;
  admins cannot read clinical tables or the medical-documents bucket.
- Storage: public (therapist photos, exercise media) vs private (credentials, medical documents) buckets with policies.
- Analytics RPCs (`admin_dashboard_stats`, `admin_report_timeseries`, `therapist_earnings_summary`); reminder and
  package-expiry jobs.
- Seed: 12 required categories, 24 services (reference); synthetic dev people/clinics/packages (dev only).

**Mobile app (Expo SDK 58, TypeScript, Expo Router)** — one app, two role-based experiences
- Patient: splash (Logo A) + onboarding; register/login/forgot/reset/email-verify/phone-OTP flow; home dashboard with
  primary "Book a physiotherapist"; service marketplace + detail; 7-step booking flow (service → clinic/home → location
  or map pin → live availability → therapist or auto-match → price breakdown/promo/package/consent → payment →
  confirmation); booking detail with timeline, live tracking (real GPS only), cancel, review; therapist profiles;
  health profile with document upload; family accounts with consent; addresses with map picker; payments &
  receipts; packages; notifications; My Recovery (goals, exercises with video, pain trend & adherence charts,
  reminders, PDF report); Larger-text accessibility option; 52 px touch targets.
- Therapist: Today/Calendar/Patients/Earnings/Profile; booking requests (accept/decline); visit workflow
  (on the way → arrived → treatment → completed) with live-location sharing; consent-gated health profile; SOAP notes;
  pain scores; exercise prescription; goals; availability & time off; credentials upload; profile, services, service area.

**Admin dashboard (Next.js 16)**: overview analytics (all from DB), patients, physiotherapists, verification queue
(signed document links; approve/reject; verify requires ≥ 1 approved credential), services CRUD, pricing, bookings
(filter, reassign, cancel, advance), clinics CRUD, home-visit rules & coverage, payments + refund queue, packages &
promotions, reviews moderation, reports + CSV export, settings, audit log. Auth enforced in `proxy.ts` **and** in every
page/action.

## In progress / partially done
- Payment provider integration: adapter written, awaiting credentials and a sandbox run.
- Push notifications: token registration + sender written; needs EAS project + physical device.

## Outstanding (not started)
- Official **Logo A / Logo B** files (placeholders in `apps/*/assets|public/brand`), official brand colours
  (provisional palette in `packages/shared/src/brand.ts`), app icon and native splash art (still Expo defaults).
- Real routing/ETA provider (distance is straight-line × factor; no ETA minutes are shown).
- Therapist payouts; refund automation (`refund-payment` function); invoices/tax handling.
- Admin: service-category CRUD, user creation, clinic opening-hours editor, exercise library.
- PDPA data-subject tools (export/erase my data), retention schedule, DPO/breach workflow — need legal input.
- Localisation (BM/中文/தமிழ்); the `preferred_language` column exists but UI is English only.
- End-to-end UI tests; screen-reader accessibility audit; load testing.
- Therapist time-off does not auto-cancel/offer existing bookings in that window.

## Known issues / limitations
- Expo **web** is a development preview only (map picker and tracking use fallbacks).
- Remote push does not work in Expo Go on Android (platform limitation) — use a development build.
- Auto-match reassignment after a decline keeps the originally quoted price even if the new therapist's travel fee differs.
- Unpaid holds are cleaned lazily on booking; schedule `expire_stale_holds()` (see docs/DEPLOYMENT.md) for tidy data.
- `seed_dev.sql` accounts share one dev password — never deploy it.
- Legal/health content (privacy summary, education articles) is draft wording needing professional review.

## Required external integrations
| Integration | Needed for | Status |
|---|---|---|
| Supabase project (Singapore region recommended) | everything | not created |
| Payment provider (FPX/DuitNow/cards/e-wallets) — e.g. Billplz | checkout | adapter written, no account |
| Google Maps or Mapbox keys | map tiles on Android, address search, routing/ETA | optional; device geocoder used otherwise |
| SMS provider (Malaysian gateway / Twilio) | phone sign-in | architecture only |
| SMTP provider | branded auth emails at volume | Supabase default for dev |
| Expo EAS project | push tokens, store builds | not created |
| BeVital logo files + brand guidelines | branding | **blocking for release** |

## UI/UX refresh — premium booking experience
- New palette/type scale (26/18/15/13/12), flat buttons/cards with subtle borders, safe-area-aware tab bar (Home, Services, Visits, Recovery, Profile).
- Home: next-visit card first (status, Pay now + countdown, Directions), Home/Clinic tiles with "from" prices, Popular services, one promo strip. Clinics, physios, packages and tips moved under Services.
- Booking reduced to 4 steps (What do you need / When and where / Your physio / Review and pay) with sticky running-price bar, sold-out dates greyed, grouped time grid, trust facts (migration 8 `therapist_public_stats`).
- Visit status screen (Confirmed → On the way → Arrived → Done), safety sheet, message/call placeholders where not yet available; payments list tucks away abandoned attempts and offers "Try again".
- Update scripts for the hosted test project: `supabase/physio_only_update.sql`, `supabase/update_booking_ux.sql`, `supabase/clean_demo_labels.sql`.
- Known gaps: in-app messaging and calling the physio, live ETA beyond distance, native device verification, pre-existing lint errors in older files.

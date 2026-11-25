# Security & privacy

> This is an engineering description, **not legal advice**. Malaysian PDPA and healthcare-regulation obligations must be
> confirmed by BeVital's legal counsel / compliance lead before launch.

## Access matrix (enforced by Postgres RLS — tested in `tests/db/rls.test.mjs`)

| Data | Patient | Therapist | Admin | Anonymous |
|---|---|---|---|---|
| Service catalogue, clinics, public settings | read | read | manage | read |
| Own account / addresses / family / packages / payments | read & manage (payments read-only) | — | read account/payment rows | — |
| Verified therapist public profile | read | own | manage | — |
| Therapist credentials & documents | — | own | review | — |
| Therapist home base location | — | own | read | — |
| **Medical records & uploaded documents** | **own only** | via audited RPC / storage **only with patient consent for that booking** | **none** | — |
| Clinical notes | only notes the therapist shares | own | **none** | — |
| Exercise programmes / goals | own | those they prescribed | **none** | — |
| Bookings | own | assigned | all rows — see note below | — |
| Payments | own (read) | — | read; no write | — |
| Audit log | — | — | read (append-only) | — |

**Note — admin and booking free text.** `bookings.symptoms` / `patient_notes` are patient-written health text. RLS lets an admin `SELECT`
the whole booking row (Postgres can't hide a column per role with the same database role), but the portal never selects those columns.
If you need a hard guarantee, move them to a separate table readable only by the patient and treating therapist.

Direct table writes are limited (see `20260115000006_row_level_security.sql`). Bookings, payments, notifications and audit logs
cannot be written by any client role.

## Controls implemented
- **Authentication**: Supabase Auth; email verification required; password ≥ 10 chars with upper/lower/digit; PKCE; refresh-token
  rotation; session tokens in the OS keystore-encrypted store on device (AES-256-CTR, key in SecureStore); sessions refresh only
  while the app is foregrounded. Role self-selection is whitelisted to `patient`/`therapist` — admins cannot be created by sign-up.
- **Privilege escalation**: protected-column triggers stop users changing role/status/email, and therapists changing
  verification, ratings or clinic.
- **Consent**: PDPA + terms consent captured at sign-up; per-booking *share health profile* consent (revocable, logged in
  `consents`); family-member authority recorded before booking.
- **Audit**: triggers log privileged changes (changed column names; values only for non-personal fields); every therapist read of
  a health profile is logged with who/what/when. `audit_logs` rejects UPDATE/DELETE.
- **Payments**: a payment can become *succeeded* only via a service-role function after provider signature verification; amount
  mismatch fails the payment; webhook retries are idempotent.
- **Secrets**: only public anon keys in apps; service-role key exists only inside Supabase Edge Functions; provider secrets via
  `supabase secrets`. `.env*` is git-ignored.
- **Transport/storage**: HTTPS (Supabase); private buckets for credentials and medical documents (signed URLs, 5 min for admins,
  60 s for patients); public buckets contain no personal health data.
- **Web portal**: auth in `proxy.ts` plus `requireAdmin()` in every page/action; `no-store`, `X-Frame-Options: DENY`,
  `nosniff`, restrictive `Permissions-Policy`; inputs validated with Zod; no `dangerouslySetInnerHTML`.
- **Input validation**: Zod on clients/server actions, CHECK constraints and enums in the database.

## A real defect the tests caught
`clinical_notes` insert policy compared `b.patient_user_id = patient_user_id` inside a sub-query, where the unqualified name bound to
the sub-query's own table (always true). A therapist could have attached a note to another patient's booking. Fixed by qualifying the
outer row; covered by a regression test.

## PDPA / healthcare checklist (for counsel)
- [ ] Lawful basis & notices for health data (sensitive personal data), including explicit consent wording and the Privacy Notice (current in-app text is a draft).
- [ ] Data-protection officer / breach-notification process (recent PDPA amendments) and data-subject request handling (access, correction, withdrawal, erasure) — tooling not yet built.
- [ ] Cross-border transfer: choose a Supabase region (Singapore recommended) and document processors (Supabase, payment provider, SMS/email, Expo push).
- [ ] Retention & medical-record keeping periods; backup/restore policy and tested recovery.
- [ ] Professional regulation: physiotherapist registration/practising certificate requirements (Allied Health Professions Act 2016) and clinic licensing — encode the exact verification criteria used by the admin queue.
- [ ] Penetration test, dependency scanning, admin MFA, IP allow-listing for the portal, rate limiting on auth.
- [ ] Review what appears in push-notification text (kept minimal; no clinical data).

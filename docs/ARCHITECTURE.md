# Architecture

## Decisions (and why)

| Decision | Reason |
|---|---|
| **One Expo app, two role-based experiences** (patient / physiotherapist) instead of two apps | Shared design system, auth, data layer and release process; roles are enforced by the database, not the UI, so splitting into two store listings later is a packaging change (`app.json` variants). |
| **Business rules live in PostgreSQL** (availability, pricing, matching, state machine, payment confirmation) | One source of truth for the mobile app, admin portal and any future client; enforceable with constraints and testable without a UI or network. |
| **Clients never write money or booking state directly** | `bookings`, `payments`, `payment_transactions`, `audit_logs` have no client write grants; all changes go through `SECURITY DEFINER` RPCs or the service role. |
| **Admin uses the anon key + the admin's own JWT** (never the service role) | A compromised admin web server cannot bypass RLS; admin powers come from explicit admin policies. |
| **`service_lines` → `service_categories` → `services`** | Adding occupational therapy, speech therapy, dietetics, nursing… is a data change (new line + categories + therapists), not a rebuild. Only `physiotherapy` is active. |
| **Next.js `cacheComponents`/prefetch turned off** | An authenticated, per-user, sensitive-data portal must never be prerendered or cached across users. |
| **Hand-written row types in `@bevital/shared`** | Works without a running DB; replace with `supabase gen types` once a local stack is part of CI. A contract test guards drift. |

## Data model (high level)

```
users ─┬─ patient_profiles ── family_members ── addresses
       └─ therapist_profiles ─┬─ therapist_private (base location, never public)
                              ├─ therapist_credentials   (private bucket documents)
                              ├─ therapist_availability  (weekly hours, ISO weekday)
                              ├─ therapist_time_off
                              └─ therapist_services ── services ── service_categories ── service_lines
clinics
bookings ── booking_status_history · treatment_sessions ── clinical_notes
         ├─ payments ── payment_transactions     packages ── package_purchases ── package_redemptions
         ├─ promotions ── promotion_redemptions
         └─ reviews (→ therapist rating aggregate by trigger)
patient_medical_records · rehabilitation_goals · exercise_programmes ── items ── completions
notifications · push_tokens · consents · audit_logs · system_settings · education_articles
therapist_live_locations (real GPS rows, only while a home booking is "on the way")
```

Clinical rows are keyed by `(patient_user_id, family_member_id)`: the account holder plus, for dependants, the family member.

## Booking engine

1. **Availability** (`get_available_times`): verified, accepting therapists who offer the service at that clinic / within
   range of the address → their weekly windows for the date → minus time off and existing bookings (with a configurable
   travel buffer after home visits) → minus past/too-soon times. Lapsed unpaid holds are ignored.
2. **Therapist list** (`search_available_therapists`): the therapists free for that exact slot, ranked (home: nearest
   first; clinic: rating first), with distance and travel fee.
3. **Quote** (`quote_booking`): server price = service + travel fee (free radius, then base + per-km, capped) + booking fee
   − promo/package. The app sends the total it displayed; if the server's total differs the booking is refused (`BV_PRICE_CHANGED`).
4. **Create** (`create_booking`): validates consent for family bookings, re-checks availability, picks a therapist
   (auto-match tries candidates in order), inserts with a payment hold. Two **exclusion constraints** make double booking
   impossible even under concurrency: one per therapist (including travel buffer), one per patient/dependant.
5. **Pay**: `initiate_payment` → Edge Function opens the provider's hosted checkout → provider webhook (HMAC-verified) →
   `confirm_payment` (service role): amount must match, idempotent, issues receipt, moves the booking to *Awaiting Confirmation*.
6. **Therapist responds**: accept → *Confirmed* (patient chose them) or *Therapist Assigned* (auto-matched/admin-assigned);
   decline → auto-match bookings are re-offered to the next therapist, otherwise cancelled with a refund flag.
7. **Visit**: *On The Way* (home only; therapist phone publishes real GPS) → *Arrived* → *Treatment In Progress*
   (creates the treatment session) → *Completed* (earnings computed). Transitions come from the data table
   `booking_status_transitions`; the TypeScript copy is tested for parity.

### Status semantics
`Pending` unpaid hold · `Awaiting Confirmation` paid, therapist must respond · `Confirmed` chosen therapist accepted ·
`Therapist Assigned` platform-matched therapist accepted (or admin reassigned & they accepted) · `On The Way` · `Arrived`
(clinic: checked in) · `Treatment In Progress` · `Completed` · `Cancelled`.

## Real data only
- No availability, GPS position, review, payment confirmation or statistic is fabricated. Empty states say so.
- Live tracking shows a map only when `therapist_live_locations` has a row written by the therapist's device; otherwise it
  says it is waiting. Only straight-line distance is shown (no invented ETA).
- Dev seed data is synthetic, `.test` emails, clearly labelled, in a separate file that must never run in production.

## Extending
- **New discipline**: insert a `service_lines` row (active), add categories/services, set `therapist_profiles.service_line_id`.
- **New payment provider**: implement `create-payment-session`/`payment-webhook` for it and set `payment_provider`; the DB side is provider-agnostic.
- **Routing/ETA**: replace the straight-line × factor distance in `_eligible_therapists` / `geocoding.ts` with a routing API.

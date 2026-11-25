# Deployment guide

## 1. Local development
```powershell
npm install
npm run db:start      # needs Docker Desktop running
npm run db:reset      # migrations + seed.sql + seed_dev.sql
```
Copy the printed API URL and anon key into `apps/mobile/.env` and `apps/admin/.env.local` (see the `.env.example` files).
Auth emails land in Inbucket (http://127.0.0.1:54324). Dev accounts: see README.

## 2. Create the production Supabase project
1. New project in the **Singapore** region (data-residency decision for counsel).
2. `npx supabase link --project-ref <ref>` then `npx supabase db push` (migrations only).
3. Load reference data **once**: run `supabase/seed.sql` in the SQL editor. **Never run `seed_dev.sql` in production.**
4. Auth → URL configuration: site URL = admin portal URL; add redirect URLs `bevital://reset-password`, `bevital://auth/callback`.
   Keep *Confirm email* on, password policy as in `config.toml`, enable CAPTCHA/rate limits, configure custom SMTP.
5. First admin: sign up normally in the app, then in the SQL editor
   `update public.users set role = 'admin' where email = 'you@bevital.example';` (admins can never be created from the app).
   Enable MFA for admin accounts.
6. Replace placeholder prices, add real clinics, and review/replace the draft education articles and promotions.

## 3. Payments (Billplz example)
```powershell
npx supabase secrets set BILLPLZ_API_KEY=... BILLPLZ_COLLECTION_ID=... BILLPLZ_X_SIGNATURE_KEY=... BILLPLZ_SANDBOX=true PAYMENT_RETURN_URL=bevital://payment-return
npx supabase functions deploy create-payment-session payment-webhook
```
- Set the provider's callback URL to `https://<ref>.supabase.co/functions/v1/payment-webhook`.
- Switch checkout on: `update public.system_settings set value = '"billplz"' where key = 'payment_provider';`
- **Test in the provider's sandbox first** (FPX test bank, card test numbers): confirm a paid bill moves the booking to
  *Awaiting Confirmation* and a receipt is issued; confirm a tampered/unsigned webhook is rejected (401); confirm an amount
  mismatch fails the payment. These functions have not yet been run against a sandbox.
- DuitNow QR, cards and e-wallets must be enabled on the provider account. Refunds are done in the provider dashboard, then
  "Mark refund handled" in the admin portal (a `refund-payment` function is future work).

## 4. Push notifications
1. `npx eas init`, set `EXPO_PUBLIC_EAS_PROJECT_ID`; build a development/production build (not Expo Go on Android).
2. `npx supabase secrets set PUSH_WEBHOOK_SECRET=<random> ` and `npx supabase functions deploy send-push`.
3. Dashboard → Database → Webhooks: on INSERT to `public.notifications`, POST to the `send-push` function with header
   `x-webhook-secret: <PUSH_WEBHOOK_SECRET>`.

## 5. Scheduled jobs (Database → Extensions → enable `pg_cron`)
```sql
select cron.schedule('bevital-expire-holds',   '*/5 * * * *',  $$select public.expire_stale_holds()$$);
select cron.schedule('bevital-reminders',      '*/15 * * * *', $$select public.enqueue_appointment_reminders()$$);
select cron.schedule('bevital-package-expiry', '0 9 * * *',    $$select public.enqueue_package_expiry_notices()$$);
```

## 6. Mobile app
- Put the official logos in `apps/mobile/assets/brand/`, set `isPlaceholder: false` in `src/config/branding.ts`; replace
  `assets/images/icon.png`, adaptive icons and the splash art.
- Maps: restrict a Google Maps key by bundle id / SHA-1 and add it via EAS secret to `android.config.googleMaps.apiKey`
  and `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (address search). Without a key the device geocoder is used.
- Phone sign-in: configure an SMS provider (or a Send-SMS hook) in Supabase, set `[auth.sms] enable_signup = true`, and
  `EXPO_PUBLIC_PHONE_AUTH_ENABLED=true`.
- `eas build -p android|ios`; submit after a physical-device test pass (see checklist).

## 7. Admin portal
Build with `npm run admin:build`; host anywhere that runs Next.js 16 (Vercel, container). Set the two `NEXT_PUBLIC_SUPABASE_*`
variables at build time. Put it behind SSO / IP allow-list if possible.

## 8. Pre-launch checklist
- [ ] Official logos, colours, icons in place
- [ ] Legal review: terms, privacy notice, consent text, cancellation/refund policy
- [ ] Real prices, clinics, verified physiotherapists, clinic assignments; every home-visit therapist has a base location
- [ ] Payment sandbox tests passed, then production keys; webhook signature failure test
- [ ] Full end-to-end pass on real iOS + Android devices (booking, home visit tracking, push, document upload, PDF report)
- [ ] RLS tests green in CI against a real `supabase start` stack (`npm test` + add an API-level suite)
- [ ] Backups & restore drill; monitoring/alerting; admin MFA; penetration test

# BeVital — No One Left Behind

On-demand physiotherapy platform for Malaysia: patients discover, book and pay for physiotherapy (at a BeVital clinic or at
home), physiotherapists run their practice, and BeVital operates it all from one admin portal. Release 1 is
**physiotherapy only**; the data model (`service_lines`) is ready for other allied-health services later.

```
apps/mobile     Expo (React Native, TypeScript) — patient AND physiotherapist app (role-based)
apps/admin      Next.js 16 (TypeScript, Tailwind) — operations portal
packages/shared Types, enums, validation, formatting, brand tokens used by both
supabase/       migrations, seeds, config, Edge Functions
tests/          database + shared tests
docs/           architecture, security, deployment
```

**Read first:** [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md) — what is built, what is verified, what is not.

## Quick start

Prerequisites: Node 22+, Docker (for local Supabase).

```powershell
npm install
npm run db:start          # local Supabase (prints API URL + anon key)
npm run db:reset          # applies migrations + seed.sql + seed_dev.sql (synthetic data)
copy apps\mobile\.env.example apps\mobile\.env          # fill EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
copy apps\admin\.env.example  apps\admin\.env.local     # fill NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
npm run mobile            # Expo dev server (use a dev build on device; web is preview only)
npm run admin             # http://localhost:3000
```

Dev accounts (local only, password `BevitalDev#2026`): `admin@dev.bevital.test`, `patient1@dev.bevital.test`,
`therapist1@dev.bevital.test` … Local emails are caught by Supabase's Inbucket (http://127.0.0.1:54324).

## Tests

```powershell
npm run typecheck   # shared + mobile + admin
npm test            # shared unit tests + 74 database tests on embedded PostgreSQL (no Docker needed)
```

The database tests apply every migration and seed, then act as each role under real Row Level Security.

## Branding

Two official logos, referenced only from `apps/mobile/src/config/branding.ts` and `apps/admin/src/config/branding.ts`:
**Logo A** (corporate: splash, onboarding, login/registration) and **Logo B** ("No One Left Behind": signed-in app).
Drop the supplied files into `apps/mobile/assets/brand/` and `apps/admin/public/brand/`, then flip `isPlaceholder` to
`false`. Never redraw or re-type them. Brand colours live in one place: `packages/shared/src/brand.ts` (provisional).

## Documentation
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design decisions, booking engine, data model
- [docs/SECURITY.md](docs/SECURITY.md) — role/access matrix, PDPA considerations
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — environments, secrets, payments, scheduled jobs, launch checklist

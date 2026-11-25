# BeVital logo assets

Replace these two files with the **official** logo artwork supplied by BeVital. Do not redraw,
recolour or re-type them.

| File | Logo | Used on |
|------|------|---------|
| `logo-main.png` | **Logo A** — BeVital main corporate logo | splash/loading, onboarding, login, registration |
| `logo-no-one-left-behind.png` | **Logo B** — "No One Left Behind" logo | everything after sign-in (patient & therapist app) |

After replacing the files, open `src/config/branding.ts`, set `isPlaceholder: false` and set each
logo's `aspectRatio` (width ÷ height of the supplied artwork). Nothing else needs to change.

The official BeVital artwork is installed (transparent PNGs trimmed from the supplied JPGs).

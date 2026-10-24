# GLOHAUS security release — 24 October 2026

## Release decision

**NOT VERIFIED: production is not confirmed secure.** The public website still serves Node v24.21.0. This is below the October security baseline. A working, separately deployed full-app preview now serves **v24.22.1**. Production promotion/configuration changes, live credentials and financial operations require owner approval. No such changes have been made.

Candidate application commit: `794fdd44cc759a508e0a4f5f7c882a1c2fbbcdeb`.
Draft release PR: https://github.com/haroonayeni99-source/glohaus/pull/160
Preview: https://glohaus1-bw4a0oges-haroon-glohaus.vercel.app
Preview deployment: `dpl_9mkerfc8df2hGG5nCsiZZYvEpQSe` (READY).
Verified container image: `vcr.vercel.com/haroon-glohaus/glohaus1/web@sha256:429adb2b8b971b3869dc9eceb4f13707e50c6400554ded577e02d95fdf2b2d2c`.

## Failed production deployment: exact cause

**FAILED:** `dpl_C3NkitKbMairJAzMceRJQqvswPv1` belongs to `glohaus-app` (`prj_IwqbTRAA8RF3yZqiAntGtrb3foNS`). Its platform error explicitly rejects hourly cron `0 * * * *` because Hobby accounts allow only daily cron jobs. The every-minute notifications schedule also exceeds that limit. This is a plan/configuration rejection, not evidence of a TypeScript failure. Build-log retrieval returned 404 for this deployment in available scopes; no inaccessible compiler log is represented as inspected. The older `dpl_C2ByiamkVy9J6ynkvAQ9STrsFCvs` has the same rejection.

The website actually belongs to `glohaus1` (`prj_dHz5OLhAjygs8hOKi99cgtGScgba`, team Haroon Glohaus), and its aliases still point to `dpl_G97scgj9Am231Fi4qyWwqxVVrk9x`, source `6a445b70df64548927ab5ea830094c6817eb5363`. Do not move the domain or migrate to the incomplete duplicate project as an incidental fix.

Hourly maintenance and every-minute notifications remain unchanged. They advance financial/accounting, reminders and arrival workflows. Removing them to fit Hobby would reduce functionality. Keep the existing glohaus1 project authoritative. Repairing `glohaus-app` itself requires an approved suitable plan/project decision and complete production configuration; alternatively disconnect the unused duplicate deployment target after approval instead of buying a second plan. No paid upgrade was purchased.

## Exact runtime evidence

| Environment | Observed version | Assessment |
| --- | --- | --- |
| Live glohaus1 application startup logs | v24.21.0 | Affected; still serving production |
| Fresh managed 24.x preview probe | v24.21.0 | Affected despite 24.x selection |
| Fresh managed 22.x preview probe | v22.23.2 | Below fixed 22.23.4; do not downgrade |
| Failed glohaus-app | Configured 22.x; no healthy runtime | Exact executing patch NOT VERIFIED |
| Local/CI application Node policy and .nvmrc | 24.22.1 | CI setup logs and floor command confirm v24.22.1 |
| Full container preview /api/health/runtime | v24.22.1, patched=true, HTTP 200 | FIXED in candidate preview |

The initial security merge `c8d014c1e21af7fabb0fb8c62920f23e5e23e2ef` already selected patched local/CI Node and added build checks, dependency upgrades, database TLS verification, nonce CSP, image-signature checking, source secret scanning and webhook signing-secret overlap. A patched build runtime did not patch the separately managed hosted runtime.

Official fixed baselines are 22.23.4, 24.22.1 and 26.12.1. Node 24 is affected by CVE-2026-111497 (Brotli), CVE-2026-105482 (DNS), CVE-2026-105483 and CVE-2026-106069 (TLS), CVE-2026-105481 (HTTP Agent), CVE-2026-106072 (TLS), CVE-2026-106074 (entropy/snapshots), and CVE-2026-106073 (permission checks). Advisory items CVE-2026-106070 and CVE-2026-106071 concern Node 26. Runtime affected status does not establish that every issue is reachable in this application or that exploitation occurred.

Vercel's managed rollout remained behind in fresh measurements. Its inbound WAF mitigations do not cover all fetched/decompressed responses and cannot substitute for patching. This release uses the supported **Container Runtime beta** to pin both build and running application to `node:24.22.1-bookworm-slim`, rather than assuming a major selector fixes it. Older managed diagnostic previews remain below the patched baseline and must not be promoted. Retire or rebuild obsolete previews before declaring every environment remediated; the connector lacks a deployment-delete operation and the local CLI has no credentials. The local Node binary also reports bundled Undici 7.30.1. A startup floor rejects unsupported/vulnerable runtimes.

## Candidate changes and validation

**FIXED in candidate:** explicit container service, Next standalone output, non-root process, preserved cron schedules and security headers. The image excludes environment files, local deployment metadata and git history. No secret is baked into Docker arguments or the image.

Container configuration arrives at runtime, not build time. A harmless probe confirmed that distinction. The candidate renders only five existing public Supabase/map/site variables through a fixed, escaped JSON allowlist with the CSP nonce. Server secrets cannot be requested through it. This preserves Supabase browser configuration and map keys without copying production secrets into previews. Tests cover secret exclusion, script escaping, malformed configuration and runtime Supabase client creation.

**FIXED in candidate dependencies:** Zod 4.6.6 throughout the graph for GHSA-mrhx-c7xc-m3w5, and Undici 6.29.1 under the Blob client for GHSA-4qv8-2p9j-2685. The latter was found by GitHub's audit after the earlier audit result; it is not ignored or suppressed.

| Check | Result |
| --- | --- |
| Final full automated suite after both dependency patches | PASS: 1,288 tests, 150 files |
| Native Node floor tests | PASS: 2 tests |
| GitHub security regression browser tests | PASS: 48 tests against the production build, desktop/mobile |
| GitHub Verify GLOHAUS workflow | PASS: lint, type-check, tests and build on Node v24.22.1 |\n| Full CI matrix at candidate commit | PASS: all 14 jobs; video setup timeout passed on targeted retry |\n| Corrected homepage editor/device regression | PASS: light/night, mobile/desktop; upload/save/retry/reload/device independence retained |
| TypeScript | PASS |
| ESLint | PASS with two pre-existing loading.tsx image warnings |
| Production and all-dependency audits | PASS: zero reported advisories in both |
| Full hosted container build | PASS, READY |
| Hosted runtime measurement | PASS: v24.22.1, patched=true, private/no-store |
| Hosted /, /shop, /explore, customer/pro sign-in | PASS: HTTP 200, expected titles, CSP, private/no-store |
| Hosted public image asset | PASS: HTTP 200 |\n| Final container native image optimizer | PASS: HTTP 200 image/jpeg for a local category image |
| Public runtime JSON nonce matches CSP | PASS on full container preview |
| Conventional Stripe credential scan | PASS: no matches in 3,227 available Git-history blobs and 77 compiled browser assets |
| Live homepage/shop/explore/sign-in HTTP checks | PASS; this is availability evidence, not provider transaction evidence |

Local generated Turbopack cache caused an invalid-persistence error on a warm rebuild. Removing only that generated cache allowed a clean rebuild; the independently hosted clean container build also passed. This is separate from the Hobby cron rejection. One diagnostic preview failed after a truncated lockfile transfer; the complete restored tree was hash-verified and subsequently built successfully. The final legacy homepage browser assertion expected the old Unsplash portrait after the already-approved replacement had reached main. The test expectation was corrected to /images/homepage-portrait-mobile.svg while retaining the desktop/mobile independence check; no application UI changed. One video-regression CI attempt timed out while downloading Ubuntu FFmpeg dependencies from the Azure package mirror, before running application assertions. Only that cancelled job was retried and it passed; the video check is retained. No application feature was removed to pass a build.

The isolated regression suite covers authorization, authentication assurance, booking deposits/full-payment logic, commission overrides, Founding programme rules, refund accounting, wallet holds, standard/instant withdrawals, dispute freezes, marketplace checkout and webhook signature/idempotency handling. No SQL migrations or business-rule changes are included. Passing these tests does not certify live provider journeys.

**NOT VERIFIED end-to-end:** real Supabase registration, verification/reset mail, authenticated professional/customer accounts, real Stripe test-mode checkout/refunds/Connect payouts, notification delivery and account-specific Owner/Admin MFA. Only the live provider account is connected; no isolated Supabase branch/database or Stripe sandbox credentials are available. Do not use live keys or real transactions as test substitutes.

## Logs and Supabase review

No error/fatal groups were returned in the inspected production runtime window. A read-only Stripe event query covering refunds, disputes, payouts and application authorizations returned one 9 October refund and no further pages, with no selected events after the Node advisory. This narrow result cannot establish whether unauthorized API requests or account access occurred. Complete Stripe API-request/IP/key-access logs were not available through this interface. A fresh read-only endpoint inspection confirms both live webhook endpoints are enabled, point to https://www.glohaus.shop/api/webhooks/stripe and use API version 2026-08-26.dahlia. Required checkout, refund, dispute, subscription, account-update and payout-result event subscriptions are present. This configuration check does not certify successful delivery/processing.

Vercel attack-status inspection returned 404, Seawall Config not found; WAF/attack-history status is NOT VERIFIED. No claim of absence of compromise is made.

Supabase's public SECURITY DEFINER warning resolves to `public.glohaus_public_site_enabled`: it returns only the maintenance boolean, uses fully qualified tables and a fixed pg_catalog search path. Revoking it would break intended public maintenance checks. The payment_runtime_secrets table also has forced RLS and denies both public roles SELECT; its values were not read. The 15 RLS-enabled/no-policy tables also deny SELECT to both anon and authenticated roles; do not add permissive policies to silence that warning. **Leaked-password protection remains disabled** and requires owner review/appropriate service configuration. No Supabase security setting was changed.

## Credentials and environment variables

No confirmed Stripe credential disclosure was found. Therefore no particular live key is proven compromised by this investigation. Precautionary rotation remains recommended after containment, with separate approval:

| Credential/configuration | Required action |
| --- | --- |
| STRIPE_SECRET_KEY | Owner-approved least-privilege replacement if precautionary rotation is chosen or API audit confirms exposure |
| STRIPE_WEBHOOK_SECRET | Rotate the matching platform endpoint signing secret separately; use STRIPE_WEBHOOK_SECRET_PREVIOUS during overlap |
| STRIPE_CONNECT_WEBHOOK_SECRET | Verify the connected-account endpoint mapping; rotate separately with STRIPE_CONNECT_WEBHOOK_SECRET_PREVIOUS overlap |
| beauty.payment_runtime_secrets fallback | Securely update matching fallback/consumers during approved signing-secret rotation; never export values |
| Publishable keys and price IDs | No rotation required solely for this audit |
| DATABASE_URL | Review encrypted/Config classification; consider Sensitive/Secret under approval |
| BLOB_READ_WRITE_TOKEN | Currently shared across production, preview and development; provision isolated storage credentials under approval |

The container candidate needs **no renamed or newly invented live payment variables**. Existing production variables stay server-side and must be attached securely at runtime: DATABASE_URL, PAYMENT_DATABASE_URL and CA configuration, Supabase URL/public key and server role, STRIPE_SECRET_KEY, both webhook signing secrets, CRON_SECRET, NEXT_PUBLIC_APP_URL, Resend/email configuration and existing Blob, routes/journey, LiveKit and VAPID feature configuration. Do not copy their values into source, chat, build arguments, local fixtures or preview.

The duplicate glohaus-app lacks important application environment names; POSTGRES_URL does not automatically satisfy DATABASE_URL. It is not a ready replacement production environment.

A harmless temporary preview-only `GLOHAUS_CONTAINER_CONFIG_PROBE` variable (ID raF4SO5GLXvdfPu6) was created for the build/runtime presence test. It contains no credential. The available connector has no delete-env operation and local Vercel CLI is unauthenticated; remove this diagnostic variable in the dashboard during cleanup. No protection setting was disabled.

## Approval, rollout and rollback

1. The application CI checks are complete. Provision isolated provider test resources for the outstanding external-provider validation. Preserve the latest application source and container image above. Review Container Runtime beta limits, database networking and observability for this project.
2. Request approval for the production release in the existing glohaus1 project. Do not automatically merge main, promote the preview, transfer domains, modify payment configuration, buy a plan or rotate credentials.
3. Build the same source with the existing production runtime environment securely supplied by Vercel. Do not promote this preview with its absent sandbox credentials and assume production-only variables appear: promotion does not rebuild. Stage without public alias assignment where supported, verify exact process.version from startup logs/admin runtime check and public/auth routing, then perform the approved alias switch.
4. Do not manually invoke cron routes, create live bookings, reset customer passwords, or execute real payments/payouts as smoke tests. Check read-only provider delivery/status evidence and sanitized runtime errors.
5. Retain the current live deployment ID and the verified candidate image. No migration changes the database, accounts or balances. An approved alias rollback can restore prior availability without restoring/deleting database records, but the old v24.21.0 deployment is an unpatched emergency fallback. Prefer a verified patched rollback candidate; never waive the runtime floor to label a release secure.
6. After approved production activation, re-measure the executing Node version and watch sanitized errors/webhook health. Until then, production remains affected and NOT VERIFIED secure.

## Primary references

- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://nodejs.org/en/blog/release/v24.22.1
- https://vercel.com/kb/bulletin/node-js-security-advisory
- https://vercel.com/docs/functions/runtimes/container
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685

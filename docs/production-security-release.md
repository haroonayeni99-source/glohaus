# Production security release — 24 October 2026

Status: NOT READY FOR PRODUCTION. No production changes are authorized by this request.

## What is already fixed

Merge c8d014c1e21af7fabb0fb8c62920f23e5e23e2ef contains Node 24.22.1 local/CI selection and build floor, compatible dependency updates, verified database TLS, nonce CSP, image signature validation, source secret scanning and webhook signing-secret overlap support. Current public domain points to READY deployment dpl_G97scgj9Am231Fi4qyWwqxVVrk9x (source 6a445b70df64548927ab5ea830094c6817eb5363) in glohaus1, project prj_dHz5OLhAjygs8hOKi99cgtGScgba, team Haroon Glohaus. That is different from glohaus-app.

## Failed deployment

Latest deployment dpl_C3NkitKbMairJAzMceRJQqvswPv1 (and earlier dpl_C2ByiamkVy9J6ynkvAQ9STrsFCvs) belongs to glohaus-app (prj_IwqbTRAA8RF3yZqiAntGtrb3foNS, team GloHaus), is ERROR, and is not serving the public domain. Its deployment metadata reports the exact rejection: Hobby accounts allow only daily Cron Jobs; the hourly expression 0 * * * * exceeds that limit. The minute notification schedule * * * * * also exceeds it. Build-log requests returned 404 from the connected account; there is no retrieved compiler log to attribute this to TypeScript or dependencies.

Keep both cron frequencies. Maintenance handles scheduled financial/accounting work; notifications also advance arrival/reminder scheduling. Changing either to daily or removing them would silently reduce functionality. Preparing an application build does not fix this billing limitation. After owner approval, use a suitably provisioned project/plan; do not buy/upgrade, transfer projects or change production schedules automatically.

## Runtime evidence and change

- glohaus-app project setting: 22.x. This is configuration, not proof of its failed function's patch version; no healthy function exists to measure on that failed deployment.
- Repository: engines 24.x, .nvmrc 24.22.1; all 14 setup-node selections use .nvmrc. Thus glohaus-app's dashboard setting conflicts with the intended repository policy even if engines overrides it at build time.
- Current public glohaus1 function: v24.21.0 in fresh startup logs. It is below 24.22.1 and remains affected by the October Node 24 fixes.
- Previous staged function: v24.21.0; protected Node 22 diagnostic: v22.23.2, below fixed 22.23.4. Do not downgrade to it.
- Vercel manages patch versions. Its bulletin still describes managed rollout in progress. WAF rules cover inbound traffic, not fetched responses. Major selection is insufficient evidence.
- This branch shares the version policy between build commands and function startup. Startup logs only process.version and rejects an unpatched hosted Node runtime before serving application requests. This is a release guard, not a way to install Node inside Vercel. A failed startup means do not promote; do not remove the guard to make an unsafe preview look healthy.

Fixed upstream baselines: Node 22.23.4, 24.22.1 and 26.12.1. The compatible supported baseline for this repository is 24.22.1 or newer stable 24.x. CVE-2026-111497 affects Brotli decoding, including potentially fetched response bodies; other October Node 24 issues include DNS, TLS hostname verification, HTTP connection reuse and permission/snapshot issues. Reachability varies; do not send exploit payloads to production.

## Environment inventory: new project is incomplete

Only Supabase/Postgres integration variables are listed in glohaus-app. Required application names absent there include DATABASE_URL, PAYMENT_DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET, CRON_SECRET, NEXT_PUBLIC_APP_URL, RESEND_API_KEY and EMAIL_FROM. Existing POSTGRES_URL variables do not automatically satisfy DATABASE_URL. Verify the database, roles, CA chain, Supabase project and callback origins before any migration or release.

Other feature configuration from glohaus1 must be inventoried by name: public URL, subscription price IDs, payout-fee flag, Blob, LiveKit, routes/journey encryption, push/VAPID and email-webhook settings. Do not copy live secret values into this branch, preview, chat or CI. Provision separate sandbox services and a separate database for non-production tests. No credentials were pulled into local files.

In glohaus1, Stripe variables remain production-only Sensitive, BLOB_READ_WRITE_TOKEN is Sensitive but shared across production/preview/development, and DATABASE_URL remains encrypted/readable. In glohaus-app, privileged Supabase/Postgres integration variables are encrypted and shared across all three scopes. This needs scope/classification review before that project can host previews safely. No metadata was changed in this request.

## Stripe and data safety

Only the existing Glohaus live account is connected; no sandbox credential is available. Financial validation uses isolated PGlite databases, mocks and fabricated signing secrets. No real charge, refund, payout, ledger mutation, credential rotation, user creation, password reset email or production migration is permitted or required for these checks.

Read-only event review since 16 October returns three checkout expirations and one balance-available event, no remaining pages or pending webhooks. Both live endpoints are enabled on API 2026-08-26.dahlia and point to www.glohaus.shop/api/webhooks/stripe. This is not a complete API-request/account-access audit and does not prove all provider journeys work.

No confirmed leak was found in the previous tracked/history/frontend scans. Recheck source and compiled assets without printing matches. Precautionary rotation targets are the actual credential behind STRIPE_SECRET_KEY and both endpoint signing secrets. Securely identify endpoint-to-variable mapping and any beauty.payment_runtime_secrets fallback, provision least-privilege replacement, overlap, update verified consumers, validate signatures/deliveries, then retire old credentials. API-key rotation does not rotate webhook secrets. Rotation requires separate explicit approval. Publishable keys and price identifiers need no rotation solely for this review.

## Deployment and rollback procedure — requires approval

1. Resolve the cron plan and explicitly choose the production project. Do not repoint domains as an incidental fix.
2. Set the approved project's Node selection to 24.x only after approval. Obtain a patched managed function runtime and test the exact preview with the startup guard.
3. Provision isolated Stripe sandbox/Supabase/database resources and run provider registration, verification/reset, checkout/deposit/full payment, refund/dispute, Connect payout and webhook delivery/retry tests. Preserve production business rules and balances.
4. Confirm all required production variable names and secure values are available in the chosen project through an owner-controlled workflow. Never export live secrets as test fixtures.
5. Stage the approved production commit without assigning public domains, verify runtime and health using production-safe read-only checks, then request explicit promotion approval. A preview promotion may rebuild with production variables; retest the staged production build.
6. Record candidate and last-known-good deployment IDs before promotion. No schema or data migration is included, so rollback does not restore/delete records. After a failed release, an owner-approved alias rollback can restore application availability, but the currently live 24.21.0 deployment is NOT a security-remediated fallback. Prefer a previously tested patched release; do not waive the runtime floor or downgrade Node as the security solution.
7. Verify registration UI, auth routing, Explore, profiles, Shop, notification links and Owner/MFA routing without mutating live accounts/payments. Observe sanitized error counts and webhook health; avoid hitting authorized cron routes during read-only checks because they perform writes.

## Evidence references

- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://nodejs.org/en/blog/release/v24.22.1
- https://vercel.com/kb/bulletin/node-js-security-advisory
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- https://vercel.com/docs/cron-jobs/usage-and-pricing

## Exact-runtime container candidate — 24 October

The managed-runtime probes still serve v24.21.0 (24.x) and v22.23.2 (22.x). An explicit Vercel Container Runtime service, supported in beta on all plans, successfully served v24.22.1 in probe dpl_DTn1P9KSvURi95YZbQJdcG3iEsjU. Selecting a root Dockerfile without the explicit service did not deploy a working container.

The candidate uses Dockerfile.vercel with node:24.22.1-bookworm-slim for build and runtime, Next standalone output, a non-root process, and the existing runtime floor. Existing cron frequencies are retained. No database migrations or financial business-rule changes are included. The intended project remains the existing live glohaus1; this does not repair the unrelated glohaus-app Hobby billing/configuration limitation.

Container builds do not receive project environment values. A harmless preview-only configuration probe confirmed runtime presence and build absence. The application therefore renders a fixed allowlist of existing public Supabase/map/site configuration in an escaped JSON script, with the existing CSP nonce. Server secrets cannot be requested through this helper. No secret is supplied as a Docker build argument or copied into the image. Tests cover unsafe script text, secret exclusion, malformed configuration and Supabase client creation from runtime configuration.

The compiled standalone server served /, /sign-in and /shop with HTTP 200 and the runtime public-configuration fixture. /api/health/runtime returned v24.22.1 and patched=true. This diagnostic is admin/MFA protected in production and uncached. These are local compiled-server checks, not proof of completed provider transactions.

Zod was updated and overridden throughout the dependency graph to 4.6.6 for GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404). Full and production dependency audits report zero advisories. Existing 1,282 tests passed after that dependency update; the additional runtime-config tests pass. Final candidate full-suite/hosted preview results will be recorded below when available.

Read-only review: no error/fatal log groups returned in the inspected production window. The live Stripe event query selected refunds, disputes, payouts and application authorizations; its only returned event was a 9 October refund, with no remaining page. This limited query cannot establish whether unauthorized API calls occurred. No live financial action was performed.

Supabase still warns that leaked-password protection is disabled. Generic SECURITY DEFINER warnings resolve to public.glohaus_public_site_enabled; this must be reviewed as a narrowly scoped public maintenance flag rather than blindly revoking it. Isolated provider credentials/database are unavailable. Real registration/email/reset, live provider checkout/refund/payout, notification delivery and account-specific Owner/MFA flows remain NOT VERIFIED end-to-end. Never substitute live credentials in previews.

Before release approval, require a working full-app container preview and exact runtime response. Production must be built with its existing server configuration through Vercel's secure environment mechanism and verified before domain assignment. Container Runtime is beta and changes the hosting mode; review platform limits/observability and rollback readiness. Preserve the previous deployment for availability rollback, understanding it remains unpatched. Do not claim production secure until a patched production runtime is actually serving.

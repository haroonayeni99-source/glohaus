# GLOHAUS bug fixing handoff — 10 October 2026

## Scope and baseline

User authorized verified fixes and deployment. Preserve approved designs, payment rules, secrets, and production data. No money movement or production database writes are part of this release.

- Repository: haroonayeni99-source/glohaus.
- Baseline main: 8e878a2e5b29c02cc3311fe1c8effe86759da5b0.
- Vercel project: glohaus1; domain: www.glohaus.shop.
- Supabase project: tyycrmmczsgnowditnii. Inspection was read-only.

## Fixes

1. Messages: switching threads previously preserved the old messages, draft, and pagination cursor while showing the new recipient. Key MessageCentre by the account, workspace, and conversation/draft target. Same-thread refresh keeps the draft. Five DOM regressions cover both roles and navigation paths; three failed against baseline and all pass after the change.
2. LIVE: the recovery button read a mutable ref during render, blocking lint. Track visibility in React state while keeping the ref for cleanup. A DOM regression verifies recovery survives failed cleanup and disappears after a successful end request. Media and API calls are mocked.
3. Database verification: shared isolated PGlite bootstrap supplies Supabase's anon, authenticated, and minimal Auth prerequisites. Recover missing table and function definitions from authoritative production metadata/history, and insert them before dependent repository migrations through a shared plan. See db/recovered/README.md for provenance and limitations.
4. Stale fixtures: match existing deposit snapshots, API error codes, public service fields, ownership-test input requirements, and delivery constraints. Application payment, ownership, and eligibility rules are unchanged.

## Release validation

Full Vitest suite: 55 files and 394 tests passed, none skipped. Lint passed with one pre-existing unused cartHref warning. Typecheck and the production build passed. Browser E2E could not run because the Chromium download returned an invalid archive; DOM regressions are not an authenticated production browser session. No customer payment, email, or live broadcast was created for verification.

## Remaining operational limitation

The repository ledger and Supabase migration history still differ. This release restores prerequisites for isolated reconstruction; it does not reconcile those histories. Original migration files/checksums and the migration drift guard are preserved. Do not run db:migrate against production or bypass its guard as part of this release. Deployment builds do not apply database migrations.

## Previously fixed or requiring a fresh symptom

The production Resend function already includes migration 0120's qualified provider-event timestamp correction. The inspected errors came from older deployments; no fresh delivery event was generated. Owner search, responsive headers, and professional messages/Owner navigation CSS fixes already exist on main. Reproduce new symptoms against current production before changing them.

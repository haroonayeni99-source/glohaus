# GLOHAUS work log

Read this file first in every session. Phase 1 only; Phase 2 has not started.

## 12 November 2026 — safety and test-discovery batch

Branch: `phase1/social-portfolio-20261112`, based on production commit `1e41daecbfc50b69682a1b3342602661c47c1da8`.
Production project: `haroon-glohaus/glohaus1` / `prj_dHz5OLhAjygs8hOKi99cgtGScgba` only.
Rollback target: `dpl_7Avo6vYBwoCgo2Fefq1yuNvG42w2`, confirmed READY and aliased to www.glohaus.shop and glohaus.shop. If a later production batch regresses, use Vercel instant rollback to this deployment; do not rebuild an old branch or change database data.

No WORK_LOG.md existed on main. Read the existing completion audit (version 7) once; it predates current production and is historical evidence only.

### Live baseline observed this session

| Journey | Evidence and limit |
| --- | --- |
| Existing signed-in session | Home identifies existing owner account; fresh login not performed |
| Sign-up | Not reverified; no disposable acceptance identity/confirmation journey completed |
| Discover | Feed, collection links and published social work render; full interactions not signed off |
| Shop | Categories/search controls and honest empty catalogue render; no order acceptance |
| Booking | Not reverified in this Phase 1 session |
| Test checkout | Not verified; no isolated Stripe sandbox established; no financial actions made |
| Professional dashboard | Signed-in dashboard renders, 1 active service, verification pending |
| Admin | Correct authenticator-session gate; privileged dashboard acceptance blocked until renewed MFA |
| Instagram | Connected UI, last sync 12 Nov 18:15; 3 Instagram items displayed Published; real refresh/import not repeated |
| TikTok | Reconnect required; last successful sync 7 Nov 17:43; existing items retained |
| Upload | Portfolio management renders 1 published video; no new upload submitted; automated upload tests pass |

Baseline is incomplete. Do not promote an application change until the missing journeys and preview regression checks pass. UI rendering is not end-to-end verification. No application runtime, schema, data, env values, provider access, payments or booking changes were made in this batch.

### Proven verification bug and scope

Before: `vitest.config.ts` included only `tests/**/*.test.ts`, silently excluding `tests/portfolio-upload-progress.test.tsx`, even when explicitly passed on the CLI. Exactly one TSX test exists today. The focused command requested five files but executed four (52 tests).
After: include `tests/**/*.test.{ts,tsx}`. The same command runs five files / 55 tests, all passed. This is a test-discovery change only. Existing TS suites remain included; upload progress, completion and safe retry now participate in ordinary CI. No extra dependencies or lockfile changes.

Focused command: `pnpm exec vitest run tests/portfolio-upload-progress.test.tsx tests/tiktok-sandbox.test.ts tests/tiktok-disconnect.test.ts tests/instagram-lifecycle.test.ts tests/social-portfolio-flow.test.ts`.
Typecheck passed. Runtime baseline tests: 2 passed. Lint passed with zero errors and two existing loading-screen image warnings. The broad suite was interrupted after extended execution without a final result; it is not claimed passed. The focused five-suite result above is the completed test evidence. No app change or promotion is being signed off.
Commit identity: the commit containing this entry (resolve with `git log -- WORK_LOG.md`); no production promotion authorised by incomplete evidence.

### Provider findings — observed, not assumed

Meta accessible app GLOHAUS `1812717093254725`: Unpublished / In development. App Review request `1812721253254309` is Not submitted and lists `instagram_business_basic` and `public_profile`. Publish page says required app settings complete. The Verification page confirms the linked Glohaus business is Verified. The submission still requires remaining Allowed usage, Data handling and Reviewer instructions steps; do not ask the owner to repeat business verification. Do not claim this app's ID matches the production Instagram client until confirmed without exposing secrets. Do not remove existing permissions merely because code currently requests only instagram_business_basic.

Meta review page: https://developers.facebook.com/apps/1812717093254725/app-review/submissions/?submission_id=1812721253254309&business_id=1596937934898418
TikTok developer sign-in subsequently succeeded through secure owner entry. App 7704607254674278420 production is Draft, with no products/scopes configured, no icon/category/description/terms/privacy/platforms or demo supplied. Nothing submitted. Sandbox and production are separate. Actual review page requires an end-to-end sandbox demo video (mp4/mov, up to 50MB each, maximum five). Existing production draft was not modified. App page: https://developers.tiktok.com/app/7704607254674278420 . Neither integration is verified for ordinary non-test professionals.

Code inspected: exact professional allowlists for Instagram testing/TikTok sandbox; public enable flags independent of credentials; no identity-verification condition in providerReady. OAuth states are encrypted, account-bound, expire in 10 minutes and validate nonce; tokens sealed with professional/provider purpose; refresh tokens persisted before downstream fetch. Focused fixture tests cover lifecycle/disconnect/visibility/isolation, not real provider approval.

Existing Instagram connection currently uses Automatic Mode and periodic syncing. This differs from the historical audit; preserve existing production settings. User's new requirement that imports remain private must be implemented and tested as an explicit future batch, not silently asserted to be true today.

### Remaining Phase 1 work

1. Complete baseline and isolated acceptance identities; renew owner MFA only when needed.
2. Inspect actual production provider metadata safely and approved app scopes; TikTok owner sign-in completed; production draft configuration and real sandbox demo still required. Prepare complete truthful submission evidence; owner handles legal/data-handling declarations and business identity evidence.
3. Reconnect TikTok using the authorised account; test real import, refresh and disconnect on disposable consented identities, including ordinary non-test professionals after approval.
4. One management area; private-import requirement; preserve moderation/restrictions and eligibility for all professional verification states.
5. Reels grid/fullscreen viewer, unified uploaded/social work, collections and service links. No UI implementation started. Before editing shared SocialPortfolio, cover profile and Discover consumers; preserve Discover design. Before adding collections schema, export affected tables and test additive migration on a copy. No migration proposed/applied yet.
6. Preview tests, mobile browser checks and physical iPhone/Android checks remain open. No preview or production deployment created by this batch.
7. Phase 1 report then wait for explicit Phase 2 go-ahead. No completion percentage claimed.

### Submission preparation notes (draft; not submitted)

Instagram purpose: a consenting GLOHAUS professional connects an eligible Instagram Business/Creator account to retrieve their own eligible media and select work for their GLOHAUS portfolio. GLOHAUS does not post to Instagram. Scope used by code: instagram_business_basic. Record an actual consent → callback → import → private draft → explicit publication → service link → customer visibility → disconnect journey. Do not supply fictional screencast evidence or invented reviewer credentials.

TikTok purpose: consenting professionals connect their own account through Login Kit and Display API to retrieve eligible public videos for portfolio selection. Code scopes: user.info.basic,video.list. Separate sandbox from production. Reviewer evidence must show actual login/import/private draft/publication/disconnect; do not claim approved public access based on sandbox.

Exact code callbacks:
- https://www.glohaus.shop/api/v1/professional/connections/instagram/callback
- https://www.glohaus.shop/api/v1/professional/connections/tiktok/callback
Instagram lifecycle:
- https://www.glohaus.shop/api/webhooks/instagram/deauthorize
- https://www.glohaus.shop/api/webhooks/instagram/data-deletion

Owner-only information: truthful legal identity/business evidence and data-handling declarations; TikTok developer login; consent for real provider accounts. Never put passwords, tokens or app secrets in this log/chat.

## 12 November 2026 — unified management preview batch

Scope: Portfolio page reuses the existing BusinessConnections controls in social-only mode, alongside the unchanged upload editor. Shared consumers identified before edits: `/professional/connections`, `tests/fixtures/business-tools-entry.tsx`, and existing connection DOM tests. Default mode retains calendars and all existing controls. Social-only mode excludes calendar forms and calendar connection cards; social requests, permissions, sync, publication and upload logic are unchanged.

Flag: preview environment only (`VERCEL_ENV=preview`, unless `PORTFOLIO_WORKSPACE_ENABLED=false`). Production is hard OFF for this batch. No production environment values changed. Existing OAuth callbacks still return to the original Connections page; consolidating that return destination is deferred until acceptance. No database migration required for this management step. Collections and Reels are not implemented by this batch.

Evidence: 6 focused test files / 66 tests passed, including two new DOM cases covering default calendar preservation, social-only filtering, disabled provider access and the unchanged real sync request path. Typecheck and production build passed. Scoped lint and diff whitespace checks passed. Browser harness was extended to cover social-only mode across its existing size/theme matrix; local Chromium could not launch (SIGABRT / ptrace denied), so no local browser/device pass is claimed. Browser download also returned a truncated archive; system Chromium was tried once. CI/preview verification remains required.

Production baseline remains the recorded deployment; this branch has not been promoted and cannot expose the new area in production. No financial, booking, schema, credential or provider-setting changes. Full-suite result will be appended after it completes. Commit: containing this entry; resolve with git log.

### Verification and preview blocker update

Implementation commit: `86ec236e0f6700146d0a58ee41fbe475a7944a19`. Preview `dpl_9dRsPPokzKYLHWhbSsfzBBejuhYK` is READY at https://glohaus1-fptynyze1-haroon-glohaus.vercel.app (glohaus1 only). It has not been promoted.

Full local suite completed: 220 files passed; 1,761 tests passed, 2 skipped (201 seconds, maxWorkers=4). CI Verify GLOHAUS, Critical customer journeys QA and Verify professional business tools all completed successfully for this exact implementation commit. The business-tools workflow passed Chromium and WebKit, including the added social-only assertions across five emulated sizes in light/night. This is fixture/browser-engine evidence, not real provider or physical-device acceptance. Verify foundation was still running at this observation.

Authenticated deployed acceptance is BLOCKED. Protected preview HTTP access succeeded, but application displays the account-unavailable gate and its public runtime configuration is empty. Vercel UI inspection confirmed DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY Preview values are restricted to the old branch `verify/referral-founding-integration-20261030`; the current Phase 1 branch has no equivalent bindings. Existing isolated project `rqsyakggwmpkqzzogvll` (GLOHAUS isolated validation) is ACTIVE_HEALTHY. No provider configuration, database, secret or environment binding was changed. Vercel secret variable Copy to Clipboard is disabled; do not reveal or replace production secrets or reuse production data to get a preview passing.

Required secure setup: in glohaus1 Environment Variables, add the existing isolated validation configuration to Preview for `phase1/social-portfolio-20261112`, using securely stored originals, then redeploy that branch. Required base account settings are isolated DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or supported anon key). Any server TLS/social/upload credentials needed for subsequent isolated acceptance must also be isolated and securely configured; never copy production values or print them. Do not move the old branch's bindings or rotate existing credentials. No next application batch or production promotion until this management batch receives signed-in preview acceptance.

Meta owner confirmation is still required for the prefilled data-handling form: legal controller and country; complete list of processors/service providers; government/national-security request history over the last 12 months; and which request-handling processes actually exist. Do not infer legal declarations from code or submit them on a generic go-ahead. Form was viewed only; answers were not edited or submitted. Reels, collections, private-import policy change, public OAuth and real non-test professional/device acceptance remain open.

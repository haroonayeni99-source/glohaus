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

## 12 November 2026 — independent calendar download compatibility fix

Branch `fix/calendar-download-20261112` starts from production/main `1e41daecbfc50b69682a1b3342602661c47c1da8`, independent of the unfinished portfolio PR #233. Live www alias reconfirmed on `dpl_7Avo6vYBwoCgo2Fefq1yuNvG42w2`; production unchanged.

Existing Apple-compatible booking-confirmation download lacked required DTSTAMP, UTF-8 content-line folding and CR-only text escaping. Extracted a small browser-safe serializer; retained UID, visible copy, event times, payment wording and download interaction. Adds required UTC generation stamp, CRLF termination, 75-octet folding without splitting Unicode and CR/LF escaping. No database, provider credentials, payments, booking logic or styling changed. Only consumer is BookingConfirmation on the customer booking detail page. Reference: RFC 5545 sections 3.1, 3.3.11, 3.6.1 https://www.rfc-editor.org/rfc/rfc5545 .

Verification: 3 focused files / 24 tests pass (new serializer parsed through existing ical.js plus business-tools and availability suites). Scoped ESLint, diff whitespace and existing conventional Stripe-secret-pattern check pass. Typecheck/build results follow in PR. No real Apple/Google/Outlook client import or signed-in preview acceptance claimed. Keep draft until preview, browser, regression and release checks complete.

Preview metadata rechecked through Vercel connector: phase1/social-portfolio-20261112 has no branch bindings. Old isolated DATABASE_URL and PAYMENT_DATABASE_URL metadata explicitly say staging logins expire 6 November 2026. This is not proof of current validity; securely recover/renew isolated credentials and verify them before any binding/redeployment. No secrets decrypted, copied, rotated or exposed. Old branch remains unchanged.

Calendar inventory: Google/Outlook already implement OAuth, primary/default-calendar busy import, optional booking export, updates/cancellation and refresh/reconnect. Existing tests are fixture evidence, not real-provider acceptance. Apple has customer .ics download; inbound private ICS busy-time subscriptions exist but are distinct from an outbound GLOHAUS subscription. No outbound revocable subscription feed or CalDAV implementation found. Do not label Apple two-way sync or claim multi-calendar account selection. Continue these as separate integration batches after isolated acceptance is available.

Next release: keep #233 draft; restore valid isolated Preview auth/database configuration, perform signed-in portfolio and core marketplace acceptance, then full release regression and request owner production approval. Calendar fix can be reviewed independently; no production approval requested before readiness.

Local follow-up: TypeScript typecheck passed. Default Turbopack build could not resolve Next outside the new worktree via shared node_modules symlink (workspace limitation); webpack fallback started, final result not yet recorded. Local commit prepared. Publishing the branch was rejected by automatic approval review as private-source/operational-note export to an unverified remote; no alternate publishing route attempted. Explicit owner confirmation needed before retrying this exact repository destination. No new PR or preview created by this batch.

Owner approved publishing this branch and draft PR. Shell push cannot authenticate; use connected GitHub app for the approved destination. Webpack compiled successfully, then Next-generated route type validation failed on unchanged Quality Control route export `summarizeRuns`. Calendar feature remains draft; repair the existing route export independently. No production promotion.

## 12 November 2026 — Quality Control route build repair

Independent branch `fix/qc-route-export-20261112`, based on production/main `1e41daecbfc50b69682a1b3342602661c47c1da8`. Full calendar build exposed an existing Next route validation error: arbitrary export summarizeRuns is not an allowed route export. Move unchanged summary logic and its run type into `src/modules/admin/quality-control-ci.ts`; retain GET, owner authorization, source fetching, response fields and failure handling in the route. Existing summary tests import the new module directly. No user-facing behavior/design/schema/provider changes.

Existing Quality Control suite: 8 tests passed. Scoped ESLint and diff whitespace pass. Full webpack build running; no build success claimed until completion. Calendar draft PR #234 is published at https://github.com/haroonayeni99-source/glohaus/pull/234 (commit c6778a4dcd175b023d250643e1a526cc28b31821); Preview dpl_86zeSvVEgVUX1fEch8CJfb6UHWJB started in glohaus1. No promotion or production changes. This repair and calendar compatibility remain separately reviewable.

Quality Control final local result: full webpack build exited 0, including generated route validation and all 106 static pages; standalone typecheck also passed. Shared dependency symlink caused 27 standalone tracing exclusions, so do not deploy this local standalone artifact. Clean CI/container Preview remains the deployment gate. Draft PR #235: https://github.com/haroonayeni99-source/glohaus/pull/235 . Calendar Preview dpl_86zeSvVEgVUX1fEch8CJfb6UHWJB is READY at https://glohaus1-jckg2cnqa-haroon-glohaus.vercel.app . CI for both PRs remains pending at last observation. All production data/configuration and live aliases unchanged. No production release is approved.


## 12 November 2026 — final-launch continuation and Preview configuration recovery

User standing approval replaces prior ask-before-merge/deploy wording, subject to all specified CI, baseline, desktop/mobile Preview, rollback and live-smoke gates. Live money, destructive database work, production-secret replacement, unapproved public OAuth and rewards still require explicit approval. This entry supersedes stale configuration observations above; do not ask the owner to recreate the three Preview variables they already added.

### Current release state

- Read WORK_LOG.md first; fetched current PR metadata and Vercel state. #234 and #235 are merged. Current main/production commit is `119d2a55611b85173f9ac7953f50b355165b4837`; READY deployment `dpl_9kzqmmoAguu6ZsmqgWAqRJX6bhY5`, https://glohaus1-3wqysqxvq-haroon-glohaus.vercel.app . No new production promotion performed this session.
- Previous READY production deployment: `dpl_H9X5tqFDNqdgGJnHsRHrYTSan3HP`, commit `f1365eb3575482afb2d62987f4b70ff4127c3b8e`. Older full baseline rollback remains `dpl_7Avo6vYBwoCgo2Fefq1yuNvG42w2`. Record the immediately previous live deployment again before any future release.
- #233 remains draft and unmerged, head `a56ed506568e7f9d0943a418c162520c30148299`. #236 remains draft and unmerged, exact implementation head `9471391ae427070263abf10707c2cb3a7cf0ae6d`. Prior CI evidence is retained, not rerun or misrepresented as acceptance.

### Completed configuration batch

Environment metadata now confirms Preview DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY on `fix/isolated-preview-auth-20261112`. Existing deployment predated those additions. Added only the missing non-secret `GLOHAUS_ISOLATED_PREVIEW_AUTH=true`, scoped to that branch/Preview; no credentials created, read in plaintext, moved or replaced. Existing strict code gate still checks both known isolated endpoints. Redeployed the same commit to `dpl_5vuCoDHUnTqLa2AVoMrZ247n5V44`, READY, https://glohaus1-h740ywppc-haroon-glohaus.vercel.app . Previous Preview `dpl_A9PbaRDPZpVhEzwXyQFEXf9ay1Zd` retained. Configuration rollback: remove only the newly added branch opt-in; production unaffected.

Real desktop browser: rebuilt Preview `/sign-in` renders working email/password controls on the Preview origin; Create an account opens the customer/professional role chooser on the same origin. No account-unavailable gate or production handoff observed. This verifies rendering/navigation only, not credential submission, email delivery, database authorization or successful signed-in acceptance. No isolated test identity was available in the session. No mobile pass claimed: available browser surface does not expose viewport/device emulation controls.

Live real-browser observations at current production: existing owner session identified on home; Discover feed and published Instagram/TikTok portfolio selectors rendered; Shop category/search controls and empty real catalogue rendered. Admin correctly presented recent-authenticator gate; `/security` showed existing two-step verification and Verify again for Admin. Fresh login/signup, booking, Stripe test checkout, upload/import and privileged Admin actions remain unverified. No live financial actions or customer-record mutations performed. These observations do not complete the baseline.

### Independent documentation batch

Branch `docs/launch-evidence-20261112`, based on current main. Added `docs/provider-review-packet-20261112.md`: TikTok description/review copy, Instagram purpose/scopes, exact code callbacks, honest real-demo recording script, calendar configuration/acceptance checklist and consolidated secure owner setup steps. No recording fabricated; no legal declaration or provider submission made. Highlights that existing automatic publication conflicts with the requested private-import policy; implementation remains pending, not silently claimed resolved. No Reels, collection schema, outbound subscription feed or runtime feature changes in this batch. Existing business verification remains recorded Verified; no repeat requested.

Validation: repository code/callback/env-key cross-check; TikTok draft copy length and `git diff --check`. Application CI need not be rerun for documentation only. Production/source configuration unchanged apart from the isolated Preview opt-in above. Documentation commit identity: containing this entry, resolve via git log.

### MY REQUIRED ACTIONS / dependent acceptance

1. Securely sign in with disposable isolated customer/professional accounts at the rebuilt Preview; if none exist, personally create and confirm them there. Supabase isolated Auth redirect settings must allow the exact Preview origin/callback. Existing three DB/auth bindings must not be recreated. Database/TLS validity remains unproven until signed-in database access.
2. Provision/attach separate non-production Blob storage and Stripe sandbox/payment-worker/TLS/webhook settings to the acceptance branch; never use production secrets/data. Metadata shows no branch upload/payment configuration. Exact settings and endpoints are in the packet.
3. At live `/security`, use Verify again for Admin with the existing authenticator. Do not replace MFA or transmit codes in chat. Privileged Admin acceptance depends on this renewal.
4. Meta: confirm production app identity, finish truthful data-handling/reviewer declarations, and record actual consent/import/private-draft/publication/disconnect flow after private-import implementation. TikTok: production app configuration/products/scopes/icon and actual sandbox recording/review submission remain pending; developer/account consent requires owner access. Public provider flags stay off pending approvals and ordinary-professional acceptance.
5. Google/Microsoft: supply platform app configuration and consent through the actual provider/Vercel interfaces; real calendar acceptance pending. No Google/Microsoft production credential keys were present in inspected metadata.

Next: complete isolated signed-in acceptance first, then fix private-import policy as its own small batch covering repository worker, API settings, UI modes and existing profile/Discover consumers; keep explicit publication and existing published/hidden states. Finish #233/#236 acceptance, desktop/mobile baseline and CI before any application merge/promotion. Continue calendar, security and Reels work after the baseline gate. No launch-ready percentage or full public-launch certification is claimed.


## 12 November 2026 — Preview login investigation

Read existing work log; reused #236 callback/fixture evidence. Read only the isolated Preview Supabase URL setting and the deployed DOM-backed public configuration: both equal https://rqsyakggwmpkqzzogvll.supabase.co. The browser client consumes that runtime field, confirming the deployed client targets the intended isolated project. No production credentials accessed. Read-only isolated auth.users query for the two owner-authorised test emails returned zero rows. Isolated auth logs contain invalid_credentials password-token failures, with no signup success in the returned auth log window. Do not infer a valid account/password or a callback failure from a rejected login.

Inspected exact #236 auth callback implementation: signup/confirmation remains on incoming Preview origin and supports code exchange/token-hash verification. This is code evidence only; email generation, redirect allowlist and real callback success remain unverified until actual signup/confirmation. No proven code/config defect or unnecessary credential/config replacement was introduced.

Prepared separate Customer and Professional registration pages on the same isolated Preview. Browser security requires the owner to enter new registration passwords and submit signup personally; secure browserAuth is for existing sign-in only, not new accounts. No auth row was inserted directly, no admin email-confirmation bypass used, and no registration/login success claimed. Owner action: finish the two prepared registrations with unique Preview passwords, then follow actual confirmation emails privately. Resume by checking isolated auth row/confirmation status, inspect genuine callback results and test login with secure browserAuth. Signed-in marketplace acceptance remains dependent on this step.


## 12 November 2026 — isolated email redirect configuration repair

User stopped additional disposable accounts and authorised using existing email addresses with separate isolated credentials, without copying production identities/passwords/tokens/data or modifying production. Supabase dashboard secure GitHub sign-in completed. Verified project label GLOHAUS isolated validation and ref rqsyakggwmpkqzzogvll before mutations. Production project was not opened or modified.

Confirmed misconfiguration: isolated Site URL was http://localhost:3000, with an empty Redirect URLs list. Saved Site URL https://glohaus1-h740ywppc-haroon-glohaus.vercel.app and added only https://glohaus1-h740ywppc-haroon-glohaus.vercel.app/auth/callback**. Scope is exact known Preview host/callback prefix (covers callback next query); no broad Vercel/team/production allowlist. Dashboard success notifications and subsequent loaded settings confirm both saves. Rollback is previous Site URL localhost:3000 and no redirect entries, but that deliberately restores broken email redirects. A future Preview host needs its own reviewed allowlist entry before email acceptance; current immutable Preview is the test origin.

Inspected confirmation and recovery templates: both default Supabase templates use .ConfirmationURL. Custom SMTP is disabled, default template editing unavailable. No hardcoded production URL was seen in either template. No code/template/credential replacement was needed for this repair. Current official docs confirm disallowed redirect falls back to Site URL and default SMTP limits delivery to project-team addresses (currently two emails/hour); arbitrary existing customer/professional addresses may need separate isolated SMTP. Do not bypass confirmation or grant test inboxes organisation access to work around mail restrictions.

Browser callback negative check: opened Preview /auth/callback?next=%2Freset-password with no code and observed same-origin /sign-in?authError=missing_code and visible confirmation error. No production handoff occurred. This proves failure routing only, not successful token exchange. Existing #236 focused/CI fixtures are reused for signup/resend/recovery URL generation, callback and cookie handling. Actual email token expiry, same-browser PKCE, new email delivery and successful confirmation/login remain pending fresh owner account consent. Old localhost-addressed/consumed links must not be reused; request a fresh link after choosing test emails and mail setup. Open PKCE confirmation in the browser/profile where the request originated; do not move verification tokens through chat.

Owner actions: identify the existing Customer and Professional email addresses to reuse (addresses only); configure a separate isolated SMTP credential in isolated Auth > Emails > SMTP Settings if those addresses are not team-authorised; then set distinct test passwords in Preview and complete fresh confirmation privately. No new account created this session; old supplied two disposable addresses still absent in isolated auth.users at check. No confirmation/login success claimed. No production read-only session used; that would need separate explicit user approval and would not prove Preview or allow bookings/uploads/test payments.

Continue genuine registration/confirmation/login and signed-in acceptance after these dependencies. Configuration repair requires no Vercel redeploy. Screenshot of saved isolated settings retained as evidence. No deployment, database migration, provider activation or payment action performed.


## 12 November 2026 — genuine customer registration and sign-in acceptance

Owner supplied newly registered isolated customer email ahheybid@svk.jp. Narrow isolated auth query confirmed email_confirmed_at set and initially last_sign_in_at absent. Secure browserAuth sign-in completed using owner-entered password; no password/codes printed or stored in this log. Follow-up joined auth.users/beauty.users/user_roles checks confirm email confirmed, successful auth sign-in, application account exists and customer role is present. The sign-up page showed genuine confirmation-email status; email link was completed by owner, not model. Do not repeat account creation or require another confirmation for this customer.

Browser reached /account on dpl_5vuCoDHUnTqLa2AVoMrZ247n5V44 but server rendered error boundary. Runtime logs showed database connection UNAVAILABLE, reason UNKNOWN/code UNSPECIFIED, about 7 ms. Branch lacked DATABASE_CA_CERT while old isolated verification branch retained the public Supabase CA. Retrieved only that existing public CA (verified certificate PEM, no private key) and added DATABASE_CA_CERT to Preview, branch fix/isolated-preview-auth-20261112. No production variables, sensitive URL/password, schema or application code modified. New env ID 0Lck2EFzhGt852e6. Rollback: remove only this new branch-scoped public CA binding and redeploy the same commit; old Preview remains intact.

Redeployed unchanged implementation 9471391ae427070263abf10707c2cb3a7cf0ae6d to dpl_CwvkZZDQVynW9QEDMtVnhG4HotTn, https://glohaus1-1iextopab-haroon-glohaus.vercel.app . Browser served login; second secure sign-in succeeded and reached /account, but database acceptance still fails. New runtime request gv4x9-1794527232871-1ccccf016e58 shows reason AUTHENTICATION, Postgres code 28P01 (~521–528 ms). CA addition removed the opaque initial connection failure and exposes a rejected isolated database credential. Full account page is NOT accepted. Do not reset the customer's password or blame email verification. Supabase Auth and application DB have distinct credentials.

Read-only role check: isolated glohaus_runtime exists, can login, belongs to beauty_app and has valid-until 19 Nov 2026. This does not establish that the current DATABASE_URL supplies that role's correct password/username. No role/password rotation performed; sensitive stored DATABASE_URL is unreadable by design. Owner action: securely correct the EXISTING branch-scoped Preview DATABASE_URL to the original valid isolated runtime/pooler connection (including properly encoded password and project-qualified username), then redeploy. Do not recreate deleted credentials, copy production URLs or replace production secrets. Current customer Preview password stays unchanged. Need secure original isolated credential or explicit approved resynchronisation of the existing isolated runtime login if it cannot be recovered.

Current Supabase email Site URL/allowlist still intentionally target prior working registration origin h740ywppc; newer immutable Preview needs an additional reviewed exact-host callback entry before fresh signup/recovery there. Sign-in does not use email callbacks and was genuinely verified on the new deployment. No successful booking/upload/Stripe or professional acceptance claimed. Reuse prior #236 CI evidence; no code changes or repeated broad tests. Production untouched.


## 13 November 2026 — final public launch push, configuration verification batch

Current user instruction supersedes older standing production approval: **no main merge or production change without new explicit approval**. Scope is confirmed bugs only; no redesign, Reels, collections, new features or repeated audits. Marketplace release does not wait for social/calendar approval.

Read main WORK_LOG first, then latest docs/launch-evidence-20261112 entries and current #233–#236 metadata. Reused recorded CI; no tests/builds rerun except one necessary unchanged Preview redeployment after the owner's DATABASE_URL update.

### Verified current state

- Vercel alias lookup confirms www.glohaus.shop on READY production dpl_9kzqmmoAguu6ZsmqgWAqRJX6bhY5, commit 119d2a55611b85173f9ac7953f50b355165b4837. Thus #234 calendar serializer and #235 Quality Control route export repair are already deployed, not pending approval. No production mutation this session.
- #233 remains draft/unmerged and currently mergeable=false; optional unified portfolio UI is outside this minimum launch push. Do not rebuild it or treat it as a marketplace launch prerequisite.
- #236 remains draft/unmerged, head 9471391ae427070263abf10707c2cb3a7cf0ae6d, mergeable=true. Existing recorded 35 passing exact-head checks and 56 focused auth tests reused. This is isolated Preview callback behavior, not proof of marketplace acceptance.
- Narrow read-only isolated auth check confirms both authorised test emails are confirmed. Customer has signed in; professional has not yet signed in. Do not create new accounts or ask for confirmation again.
- Preview env metadata confirms existing base auth/DB, isolated-auth opt-in and CA bindings. DATABASE_URL was updated at 2026-11-13 00:01:36 UTC, AFTER previous Preview was created. Secret value was not decrypted or exposed.
- Redeployed unchanged #236 commit once to pick up that update: dpl_GpMSn8hJUNvWeYTKGDtvrQQgViMY, READY, https://glohaus1-r265s2i6w-haroon-glohaus.vercel.app, target null (Preview), correct glohaus1 project. Initial API target=preview was rejected without a deployment; corrected by omitting target per API behavior. No production deployment.
- Read-only GET /explore returned HTTP 200 WITH explicit professionals-load failure; not a pass. Runtime request zmh2x-1794528587127-a7c688bf750a confirms DATABASE connection reason AUTHENTICATION / PostgreSQL 28P01 (~749ms) on the NEW deployment. Owner's recent URL edit has therefore been tested and still fails. No new sign-in requested because public DB read already proves the same blocker.
- Existing old Preview signed-in /account tab still displays error boundary; preserved for continuity. No passwords, tokens, customer records, database roles, schema, provider flags, storage or Stripe configuration changed.

### Minimum acceptance ledger — reuse, do not repeat passing steps

| Requirement | Current evidence | Outstanding |
| --- | --- | --- |
| Customer auth | Genuine registration, confirmation and Auth sign-in previously verified; confirmed again read-only | Account DB page; password-reset email/token journey |
| Professional auth | Genuine registration/confirmation verified read-only | Secure sign-in, application role/dashboard and password reset |
| Profile/photo/video and cross-user isolation | Existing focused upload/social fixture evidence retained | Real isolated uploads and two-identity API/RLS/storage denial checks |
| Availability/conflict/cancellation | Prior CI fixture evidence retained | Isolated signed-in journey |
| Deposit/checkout/webhook/refund | Prior CI evidence only; no transaction made | Separate Stripe sandbox and payment DB/webhook settings, then genuine sandbox acceptance |
| Professional and Owner/Admin restrictions | Prior owner MFA gate and CI evidence retained | Isolated privileged/non-privileged acceptance; do not grant production roles |
| iPhone/Android widths/PWA | Prior Chromium/WebKit fixture matrix retained | App-backed responsive/PWA acceptance; physical devices not claimed |

### Blockers and next concrete work

1. Current stored isolated DB login is rejected (28P01), independent of Supabase Auth. Do not repeat the previous instruction to recreate base Preview settings or redo user registration. Recover the original valid isolated glohaus_runtime credential. If unrecoverable, owner must deliberately resynchronise the existing isolated runtime login and its EXISTING branch-scoped URL securely; this is credential maintenance, not an app code defect. No credential rotation or speculative password change authorised/performed by this batch. Keep password out of chat/logs.
2. Separate non-production Blob and Stripe/payment-worker bindings remain absent from inspected branch metadata. Exact keys, callback endpoints and setup steps are already in docs/provider-review-packet-20261112.md; use that packet once, reuse any existing isolated resources, never copy production credentials. Do not claim live-only Stripe connector can certify sandbox.
3. Any fresh recovery link on the new immutable Preview needs reviewed exact-host callback allowance in isolated Supabase. Existing h740ywppc registration origin remains configured and both confirmations are complete; don't disturb working confirmation setup or request repeat signup.
4. After DB is genuinely usable, resume only missing minimum tests above. Stop retries on known invalid DB credentials. Do not change security/RLS to work around login failure.
5. Provider packet already contains truthful TikTok/Instagram scopes, callbacks, draft review copy and real demo script; no additional draft or fabricated recording needed. Legal declarations/real consent and public OAuth approvals remain separate. Apple is a one-time .ics export, not verified sync; Google/Outlook real integration acceptance remains pending.

### Release/rollback package

No NEW application PR is ready for production approval in this batch. #234/#235 are already live. #236 has passing CI but deployed DB acceptance blocked; #233 is optional and remains draft. No unverified change should be included in a launch approval request.

Current production rollback point for a future new application release: dpl_9kzqmmoAguu6ZsmqgWAqRJX6bhY5 / 119d2a55611b85173f9ac7953f50b355165b4837. Earlier rollback candidates remain in previous entries. Preview rollback is previous dpl_CwvkZZDQVynW9QEDMtVnhG4HotTn; restoring it does not repair the invalid DB login.

This batch changes documentation only. No broad CI rerun needed. All work possible without missing credentials/provider access has been recorded; resume from this ledger after the DB credential is securely made usable.


## 13 November 2026 — calendar readiness batch

Current owner priorities supersede the old sandbox/storage prerequisites: preserve working production Stripe/uploads; no extra test storage. Google/Outlook first, social approvals separate, production approval still required.

Vercel metadata: no GOOGLE_CALENDAR_CLIENT_ID/SECRET or MICROSOFT_CALENDAR_CLIENT_ID/SECRET bindings; GOOGLE_ROUTES_API_KEY is unrelated. OAuth readiness cannot be completed with existing credentials. Google/Outlook code already supports primary/default calendar busy snapshots, export/update/delete and PKCE; Microsoft uses /common for personal and organisational accounts. App registration account audience remains provider-side and unverified. No provider consent, real booking acceptance or two-way sync claimed.

Confirmed fixes: cancellation DELETE 401/403 now raises RECONNECT_REQUIRED consistently with other calendar calls; calendar refresh button/success feedback no longer refer to videos; revoked calendar access directs to calendar controls rather than Social Media. ICS copy explicitly describes inbound one-way busy import, hours of possible delay, no outbound feed and no external edits to GLOHAUS bookings. No database/provider configuration/payment/upload change.

Focused verification: 29 tests across business-tools and BusinessConnections DOM suites passed, including two provider cancellation denial regressions and Outlook feedback/reconnect navigation. Scoped ESLint, TypeScript and diff whitespace passed before final copy-only edit. Previous broader evidence reused; no build/redeploy yet.

Preview DB bounded attempt: supported get_project_env for existing branch DATABASE_URL returns sensitive/secret with no readable value. Cannot safely verify project target, pooler user/host/port or encoding; therefore stop before rotation. Scope is correct and previous redeployment postdates last edit, but those do NOT prove isolated target. No rotation/redeploy made. One owner action: securely provide the isolated Connect pooler template's non-secret host/port/project-qualified username (no password); target must be proven before any authorised one-time isolated role rotation. Not a production defect.

Rollback: revert this batch commit; production baseline remains dpl_9kzqmmoAguu6ZsmqgWAqRJX6bhY5 /119d2a55611b85173f9ac7953f50b355165b4837. Real provider acceptance blocked by absent OAuth app configuration and owner consent.


## 13 November 2026 — private imports and provider setup batch

Added default-OFF SOCIAL_AUTO_PUBLISH_ENABLED guard for both social import workers, including legacy automatic connections. Existing published/hidden choices retained by unchanged upsert. API denies automatic-mode activation while OFF; Connections UI hides that option and presents legacy automatic as approval. Explicit item publication and manual imports remain unchanged. No schema, production data, OAuth flags, Stripe or upload configuration changed.

Focused social+UI run: 33 tests passed before two additional API denial tests; final social run passed 24 tests, including both API denial regressions. A test-only unknown result type was corrected after typecheck; no runtime defect. Scoped ESLint/TypeScript/whitespace passed. Actual Meta/TikTok calls, demo recordings and provider approval not claimed. Public OAuth remains disabled by existing readiness gates.

Google console attempt returned Site Unavailable (no configuration available); Microsoft Entra reached owner Azure sign-in. No credential entry attempted; all independent source fixes finished before asking owner. Provider packet now includes exact callbacks, scopes, multi-tenant/personal audience, secure variable names, test-user/consent requirements and acceptance limitations. Existing callbacks only allow live GLOHAUS hostnames; current Preview cannot certify a real calendar OAuth callback. No misrepresentation as two-way sync or an outbound ICS feed.

Shell publishing could not authenticate; connected GitHub API used for authorised branch destination. Calendar commit 98c3dc169bff8b17a777e975daea9eca369b842b published on fix/calendar-social-readiness-20261113, not main. Combined small PR contains independently revertible calendar and social guard commits. No production merge/deployment. No extra storage or sandbox Stripe setup requested.

Next owner dependency: Google OAuth app access/config and Microsoft Azure sign-in; Meta truthful declarations/provider consent; TikTok real authorised demo after private-import release. Preview dependency stays one action: provide isolated Connect pooler host/port/project-qualified username (non-secret) so target can be proven before any role rotation. No more Preview DB retries in this batch.


### PR #238 verification follow-up

PR https://github.com/haroonayeni99-source/glohaus/pull/238 published, head 9926ae2abbf98885611f8cf217446ee03e8d1a86; Preview dpl_BAmkgN4ngZShA1kKN1Y9KuTAj59N READY at https://glohaus1-3npmxjcrb-haroon-glohaus.vercel.app. No app-backed/provider acceptance claimed. CI calendar network, booking/security/payment-browser and other checks passed; business-tools-browser failed because its Google revoked-access fixture still expected the old social error wording. Updated that assertion to require the new calendar-specific revoked message; no product workaround or removed coverage. Final exact-head CI remains required after this harness-only correction. Default-OFF publication gate regression/UI tests pass; TypeScript, scoped lint and conventional Stripe-secret pattern check pass.

## 14 November 2026 — Instagram recovery investigation and #241 CI repair

Scope: existing fix/pro-bookings-theme-contrast-20261114 branch / draft PR #241. No production writes, provider configuration changes, account changes, token reads, publication changes or TikTok changes.

Read-only production evidence for the sole existing Instagram test-allowlisted professional: Instagram connection is connected, last_error NULL, credentials present (boolean only), sync_enabled true, approval mode; last_success_at 2026-11-13 23:45:21.850722 UTC. The allowlist still matches that connection owner. INSTAGRAM_ENABLED is absent, so public access remains OFF. Production INSTAGRAM_API_VERSION is v26.0. Client ID and secret remain sensitive/unreadable; exact app-ID match with the Meta dashboard is not independently verified. Existing OAuth requests instagram_business_basic, uses Instagram Login and the existing production callback; no replacement Meta app/credentials proposed. Database success metadata is not a fresh observed consent/account/media API test.

Portfolio inventory for that professional: 3 Instagram records Hidden and source_available=true; all 3 retain original links and captions; no service associations currently assigned. Zero Instagram Draft/Published/Unavailable rows in this scoped result. Existing 2 TikTok records Published/source available were left unchanged. TikTok connection metadata reports RECONNECT_REQUIRED; this does not invalidate its existing previews and no TikTok action was taken.

Confirmed disappearance mechanism: disconnect hides imported records; later sync deliberately preserves Hidden to respect privacy. Existing BusinessConnections lists hidden records and allows Display -> Draft or Published -> Save post; owned PUT checks source availability, ownership and service ownership. Recovery needs explicit per-item publication choice, not reimport or database rewriting. Upsert deduplicates by professional/platform/external ID and retains service associations. All records remain untouched. Automatic publication stays default OFF via existing SOCIAL_AUTO_PUBLISH_ENABLED guard (no such env binding observed).

#241 exact original head d5deb1a: Vercel Preview dpl_3CEk3VdMJsAaWkubf8zR5211NNmc READY, https://glohaus1-mb9p38r98-haroon-glohaus.vercel.app. Browser directly observed Account Access error on /professional/bookings, so no signed-in/theme/device acceptance claimed. Preview branch lacks isolated auth/database and Instagram provider bindings; existing OAuth configuration rejects Preview hostnames and callbacks target live hosts. Do not copy production users/tokens/credentials into Preview or claim isolated provider acceptance. Prior isolated DB 28P01 blocker is retained; not retried.

Confirmed CI correction in this branch: booking test passed children directly as a prop to createElement (lint failure); now uses typed component props. Its active-tab assertion incorrectly assumed aria-current immediately preceded the closing angle bracket; now permits href/other attributes while requiring Upcoming on the current anchor. No production component or CSS change beyond the existing #241 fix. Scoped lint passes. Focused bookings/Instagram lifecycle/social portfolio run: 45 tests passed. Final bookings-only test and TypeScript results are recorded after completion.

Existing CI evidence reused: booking-checkout-browser, customer-booking-security, native seller/payout PostgreSQL, home-screen-pwa and multiple other foundation jobs passed. Verify/security jobs stopped on the test lint error. Separate mobile-pwa-browser failed waiting for startup wordmark opacity 1 (observed opacity 0 then element absent); no loader rewrite or speculative test relaxation made. This remains a release blocker requiring bounded reproduction independently of bookings styling.

Rules & Policies: available prior evidence reports current operation and no reproducible failure. Source awaits authorised policyWorkspace data; this is a possible loading dependency, not a confirmed cause. Feature untouched.

Meta demonstration remains blocked on usable isolated Preview OAuth configuration and fresh authorised account consent, not on lost portfolio rows. Reuse docs/provider-review-packet-20261112.md: Instagram Login -> actual instagram_business_basic consent -> account identification -> import/refresh -> private draft -> explicit selected publication -> portfolio display. No TikTok substitution, fabricated recording or public-approval claim. No merge/deploy to production authorised or performed. Ready for Production Approval: no.

Final local verification: scoped ESLint passed; 3 bookings tests passed; full TypeScript check passed. Earlier focused social/lifecycle run passed all 42 social tests (45 including bookings). No further broad build/test run needed for these test-only changes. GitHub exact-new-head CI remains required; existing loader failure and signed-in Preview acceptance remain open.

## 18 November 2026 — independent work order and persistent queues

Read the attached owner work order and preserved its complete text under docs/work-orders/2026-11-18-independent-implementation.md. It explicitly keeps £1 booking fees and proposed promotions unchanged, forbids financial/reward activation, defers provider login tasks and requires independent work to continue around genuine blockers.

Created separate persistent registers: docs/task-registers/INDEPENDENT-WORK.md and docs/task-registers/OWNER-ACTION-REQUIRED.md. Each includes the requested fields, status vocabulary, evidence limitations and dependencies. Future sessions must update these rather than repeat broad unchanged audits.

Current verified production: #241 merged fc48d1818d9fe69f3c654421e34e973a05862085; glohaus1 dpl_5U4mZPgAv19UD1bQHAcBDtFmcDk5 READY with custom domains. Forty exact-head checks passed; production public-route and anonymous 401 smoke checks passed; initial error/fatal and text Error scans returned no groups. Actual signed-in booking/physical-device acceptance was not claimed. Rollback: dpl_9T3KuxYkPBqbfNQ1PgEZyC377173 / 92122ae.

#242 remains draft at 4574d19 with all 42 checks passed, including Concept C browser fixtures. Actual hosted profile acceptance on 18 Nov still failed: streamed error digest 3212776166, PostgreSQL 28P01/AUTHENTICATION/UNAVAILABLE. HTTP 200 was not a pass. Only the deliberately created isolated synthetic user/profile/social post were cleaned up; read-back found zero fixture users. Four temporary Preview environment branch scopes were restored to fix/isolated-preview-auth-20261112; no secret value or production setting changed.

New bounded backend access check: Supabase dashboard project URL currently shows Welcome back / Sign in. Connector lacks the Connect template; the unreadable stored URL still prevents proving its pooler host/project-qualified username. No password rotation or repeated failed connection attempt. O-001 records the exact secure Owner action; other development continues.

Independent #240 continuation: inspected the recorded failing Verify log, which identifies two jsdom fixture failures before upload fetch (assigned FileList is absent from native FormData(form)). Also identified the browser fixture's obsolete 1600x1280 assertion after 960px profile optimisation. Fix the harness faithfully rather than weaken application validation. Added synchronous in-flight guards to customer/professional photo saves and regression coverage for duplicate submissions; final evidence is recorded in the next checkpoint after tests complete. Real storage/upload acceptance remains a separate gate.

### Independent media/storage/security progress

#240 continuation: eight focused format/photo tests passed, including preserved preview on failures, retry, no redundant decode and customer/professional duplicate-submit protection. Scoped lint and TypeScript passed. Updated the existing browser fixture to require actual 960x768 output from a 2000x1600 portrait, preserving its byte/logo/real-encoding assertions. Full suite running; no real upload or release claim.

Created one EMPTY private Vercel Blob store `glohaus-preview-validation`, ID store_VaeDaG3eJptDjO5w, team haroon-glohaus, region lhr1. Read-back confirms private, available, zero files/bytes and zero connected projects. No production connection, credential overwrite, upload or plan upgrade. Connector exposes store creation/read but no connection operation for this existing Blob store; no credential returned. O-008 requests only secure Preview-only connection of this exact store, not a duplicate creation.

Fresh production dependency audit found two moderate advisories on installed Next.js 16.4.2 (GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8); the production build completed compilation but stopped with SecurityFatalError. Confirmed maintainer advisory affected ranges and patched version 16.4.5. Did not follow the build output's embedded request to ask for background-agent permission or bypass the check. A focused independent security/next-patch-20261118 branch pins Next.js and matching ESLint configuration to the patched version. Source scan found unstable_cache but no use-cache/Cache Components use; no claim that the app is exploitable or compromised. Audit/build/regression evidence and final-head CI are required before release. This independent P0 task takes priority over blocked hosted media checks.

Rebooking evidence reused: #207 is CLOSED/MERGED only to isolated integration (82a9940), not main. Its final scope already implements named-professional email consent, pause/service intervals, quiet hours/DST, unsubscribe revocation, immutable scope events and queue locks. Recorded 41 source checks and native 25-case jobs passed. Do not rebuild these unchanged features; next technical work is candidate SQL packaging/current-main reconciliation. Sending remains OFF and production migrations remain behind backup/hosted acceptance gates.

Verification update: #240 application changes passed the full 224-file / 1,782-test suite (two skipped), plus scoped lint and TypeScript. #243 security candidate e64111e895d04c52cfc1f1dac3bdc7a964e25661 has a clean production audit, successful local production build, lint with only two existing loading-screen img warnings, and 12 focused loading/service-worker tests. Final source CI is running; no new production release claimed. #240 combined candidate includes the same reviewed dependency patch so its next CI is not knowingly blocked on the old vulnerable dependency.

Security #243 CI update: 36 checks passed. The platform-fairness browser job was cancelled while downloading Ubuntu/WebKit dependencies (no application assertion ran); the two Verify jobs were still active. Retry only the cancelled infrastructure job once; do not rerun successful checks or describe the cancellation as a product failure. No production release until the applicable final checks pass.

## 18 November 2026 — verified security production release

PR #243 merged as da18c2ddd16284c2642f9f679d8864b671be2deb after all 39 final-head checks passed. Next.js/eslint-config-next 16.4.5 production audit reports zero vulnerabilities; local production build passed. glohaus1 deployment dpl_B6xfqzJ2PusikYirH1SdUefTW3MR is READY with www.glohaus.shop assigned. Public Home, Shop, Discover and GLOHAUS Test Studio profile return actual rendered content without streamed server error digests. Initial error/fatal and text Error log scans return no groups. The fetch tool returned a 401 at its authentication stage for /api/v1/me; this is not additional application auth acceptance. Rollback remains previous verified dpl_5U4mZPgAv19UD1bQHAcBDtFmcDk5 / fc48d18. No database, payment, credential or social activation changes.

Common draft #245 final head 8b21c3b1871cd39481d131837e0e6ba824899528 has 43 focused tests, scoped lint, TypeScript and production build passing; final CI is still running with no failure observed at this checkpoint. Hosted Preview acceptance remains blocked by O-001/O-008, and uploaded-file pin/order/custom collections remain incomplete. No full-feature production claim.

## 18 November 2026 — independent deposit visibility release candidate

Continuing scoped #231 as independent Batch 1 work while hosted social/backend prerequisites remain blocked. Main already contains the original approved deposit rules and verified Next.js patch. Runtime diff is component-scoped theme CSS: pale notice, explicit readable legend/intro/labels and white controls, mobile width containment. Replaced the older globals-only approach because later night-mode rules would override some controls. No deposit component/business logic change.

Added actual DepositSelector fixture and browser assertions for light/night at 320/390/820/1440, AA contrast, overflow, Starter read-only notice, percentage/fixed interaction and existing 15–40% bounds. Existing booking theme browser checks remain. Local browser is environment-blocked; final-head CI required before production release. Rollback: dpl_HkSncNoneVmxm9c5medvhDC8u1Ne / 7d288fc. No migrations, credentials, real payments or provider activation.

## 19 November 2026 — Owner QC continuity and efficient release checks

Confirmed stale QC Live vs pending build (8 November), uncaught localStorage write failure and automatic overwrite after unreadable restore. Replaced hardcoded deployment snapshot with non-secret serving-build metadata passed through the existing Owner-only page, explicit unverified-state wording and stable links to both registers. Storage failure keeps the workspace usable with export guidance, and does not overwrite unreadable saved data. Existing manual audits and permissions preserved; no server storage or full-platform verification claim.

18 focused/current QC tests passed; scoped lint passed. Browser/apt setup cancellation was confirmed for two #242 CI jobs before product assertions. To avoid recurring duplicate work, foundation CI keeps pull_request and main push validation while skipping duplicate feature-push runs; existing ffmpeg steps reuse an installed encoder and otherwise install normally. No tests or coverage removed. Candidate follows #231 and must be reviewed against merged main before release; current CI and production smoke still required.

## 19 November 2026 — release continuation checkpoint

#231 merged as ac0bce31326b460a82321f2f6e0523c81fd9daec after all four PR workflows passed. A targeted retry resolved the one platform-fairness browser-setup cancellation. glohaus1 dpl_CTMkZiyEJC3MLYN1yWukHnZyunTM READY with custom domains. Public Home/Shop/Discover and actual GLOHAUS Test Studio profile render without streamed server errors, corrected production CSS confirmed, initial error/fatal and text Error scans empty. Rollback dpl_HkSncNoneVmxm9c5medvhDC8u1Ne / 7d288fc. Signed-in deposit/physical-device acceptance not claimed; policies unchanged.

#246 head 5c4a70f passed all four PR workflows after targeted retries of two dependency-setup failures; passing jobs were retained. Reviewed seven-file QC/CI/docs/test diff against deployed main; merged as d3fd5ecbd6e47fb07972e5f3cae514979de0ec10. Production dpl_BUNjDD8iAabgpgDZBsSi4AqaSJMK is READY with www.glohaus.shop assigned. Home/Shop/Discover and the actual public test profile render without streamed server failures. Anonymous QC returns the expected NEXT_REDIRECT to sign-in (not an application error), without private workspace content. Initial error/fatal and text Error scans empty. Signed-in Owner acceptance is not claimed. Rollback: verified dpl_CTMkZiyEJC3MLYN1yWukHnZyunTM / ac0bce3. No data, permissions, payments or provider changes.

Native playback requirements are persisted on #242 b433e5d and coordinated in #245 894ba72. Common application source passes 1,801 local tests (2 skipped), type/lint/build and dedicated native-viewer mobile/desktop/theme browser checks. #242 has one remaining repeated browser-dependency failure after its bounded retry. #245 has 16/17 foundation jobs passing and one encoder-setup cancellation; its sole-job retry has been requested. These are not genuine provider playback acceptance. Hosted Preview database/storage and public-provider approval gates remain; no public activation. Native viewing addendum is now linked from the canonical work order.

## 19 November 2026 — independent public viewer rollout

Owner reiterated implement/deploy. Extracted only public display code from fully green common #245 894ba72 onto current deployed main. Public DB queries and repositories are byte-for-byte unchanged; no account/upload/OAuth/publication/schema/payment/permission edits. Discover unchanged. New server gate defaults production OFF, allows an exact test-profile canary, and has an explicit false kill switch. Existing view remains the fallback. This does not waive #245's blocked genuine account/upload/provider acceptance or enable public providers.

Focused rollout/player/import/booking contrast run: 47 tests passed across five files, including three gate tests and twelve native player cases. Plan: verify remaining local/current renderer checks, deploy scoped display canary, exercise genuine existing published test-profile media without writes, then roll out the display if successful. No full Concept C, upload or provider acceptance claim; prior approved release remains rollback.

Public display candidate verification: frozen-lockfile online installation, scoped ESLint, TypeScript and production build passed; production dependency audit reports zero vulnerabilities. No lockfile changes. Offline policy metadata was unavailable initially, so verification continued with an online frozen install and explicit production audit. Dedicated viewer/rollout CI remains required before canary enablement.

## 19 November 2026 — independent public portfolio display LIVE

#248 extracted only the public display from verified #245 onto current main; DB queries, auth, uploads, OAuth/import/publication, payments and Discover unchanged. Deployed canary 7cf2fa3 / dpl_AXtFvJ6m5VqLREomnsmqX6PfYEvQ behind exact test-profile flag. Real read-only browser acceptance: existing Braids and Locs videos decoded/played with advancing time and no errors; mute, next-item isolation, Close/Escape/Back, focus/scroll restoration, three 9:16 columns and no overflow verified. No user record/file/booking/payment changed.

Enabled only OUR_WORK_VIEWER_ENABLED=true and redeployed unchanged source as dpl_EhbrEuB7xUH3jBzNoP4i2nTZdqAe, READY with custom domains assigned. Test and non-canary public profiles serve the grid; Home/Shop/Discover and both profiles return rendered content without streamed errors. Initial error/fatal and text Error scans empty. Final browser re-opened the wider-release viewer. Scoped checks: 47 local tests, lint/type/build, zero-vulnerability production audit; current viewer/main/critical/professional-tools workflows passed, foundation still running at rollout. No claim that all foundation checks passed or that provider fixtures prove genuine playback.

Public provider launch flags remain OFF; no provider connection/import activation. Full #245 upload/account acceptance, actual TikTok/Instagram playback signoff and uploaded pin/order/custom collections remain unfinished. Keep future integration from overwriting the now-live rollout guard; isolated DB/storage repair is not needed for this display-only read path. Immediate rollback: verified pre-viewer dpl_B7tZD2HmsQxikfFoSdfrFDikLDtJ / 6610c6b; alternatively false display flag plus redeployment. No secrets changed.


## 2026-11-19 — independent notification read-state recovery

Confirmed a client race: mark-all optimistically marked every item in the latest state, including notifications arriving after the submitted snapshot. Limited the local acknowledgement to submitted unread IDs; server stream remains authoritative. Serialised item/all writes with a synchronous guard, bounded requests at 15 seconds, retained unread state and retry on errors, skipped already-read item writes, and reused the agreed delayed pink dots inside existing buttons. No notification sending, backend/schema, account permissions or financial changes.

Focused inbox/backend tests: 13 passed. Scoped lint and TypeScript pass. Added actual-browser live-arrival acceptance to the existing notification responsive/theme workflow; exact-head CI and production acceptance remain required. Release is independent of isolated Preview database/storage and portfolio schema blockers.


## 2026-11-19 — verified independent continuation checkpoint

Completed custom collection CRUD/order, uploaded featured pin/order and mixed membership in common #245 bbf4d48 on current main, preserving the live public viewer guard. Candidate SQL is excluded from production migrations and organisation requires an explicit Preview-only flag. All six exact-head workflows pass, including native PostgreSQL ownership/privacy and actual browser controls across eight theme/viewport combinations. Local suite: 232 files / 1,847 passed, 2 skipped; lint, TypeScript and build pass. Applied the candidate schema to isolated rqsyakggwmpkqzzogvll only; verified all three new tables have enabled/forced RLS and two policies each. No existing source/customer record was changed. Genuine hosted application/upload/provider acceptance remains blocked; the full management/photo candidate is not deployed to production.

Independent notification recovery #250 merged ff07d50a2d92956d0e5335b336f42c339b428655; production dpl_491vUoM9Hy2L2NCg6QGYud5dXW7N READY and public acceptance checks verified. Fixes concurrent read writes, marks only the submitted snapshot locally, preserves live arrivals, bounds stalled requests and uses delayed pink dots. Thirteen focused tests and all three exact-head workflows pass, including actual browser live-arrival/mobile/theme checks.

Independent render-health #251 merged 1724bbfc2113f87c236ca2290b48172f608bfa40; production dpl_74Yk6EiScSDR4aeJZmrM3xcKLVAE READY and deployment checks verified. Bounded public HTML checks detect streamed HTTP-200 render failures and never return page bodies/digests. Thirteen focused API/module and four monitor tests, lint/type/build, all three workflows pass. The actual helper accepted genuine Shop HTML and rejected genuine failing Preview HTML. No claim of authenticated/payment acceptance.

Confirmed and repaired isolated rqsyakggwmpkqzzogvll runtime login expiry through 26 November 23:59:59 UTC only; no password or privilege change. A single fresh existing Preview request still has runtime 28P01. O-001 target/credential configuration, O-002 recovery evidence, O-008 private Preview storage connection and provider readiness remain in the separate Owner register. No production schema/credentials, fees, commissions, payouts, public connections or automatic messaging changed. Immediate rollback evidence is the preceding verified deployment recorded for each release.

Combined release main 1724bbf additionally passed 26 focused Vitest cases, four monitor cases and TypeScript. Isolated metadata checks confirm anon/authenticated have no private-table access and all three public views are security barriers owned by beauty_catalog. Isolated migration records: extend_isolated_validation_runtime_login_20261119 and isolated_portfolio_organisation_candidate_20261119. Immediate rollback for #250 is dpl_5wsjVGpfLeRmoeNRCVxGC3SPYWbp; for #251 it is dpl_491vUoM9Hy2L2NCg6QGYud5dXW7N. The protected QC API tool fetch returned empty 401, not evidence of genuine Owner application acceptance.

## 2026-11-19 — Concept C immersive visual upgrade candidate

Owner prioritised customer-facing viewing over QC/admin. Preserved grid/Discover and implemented selected uploaded-video autoplay/tap pause/sound, mixed-media vertical touch/wheel/keyboard transitions, focus/scroll restoration, rejected-autoplay fallback and reduced-motion support. Retained social consent; TikTok uses official muted autoplay and messaging, with 3002 Play fallback. Instagram keeps supported native controls; provider input has a separate side gesture rail. Public service-image associations now support existing uploaded-work booking links. Removed only the arbitrary profile upload query cutoff; public eligibility/privacy remains.

Preview/production-canary display gate is independent of public social connection and #245 management gates. Twenty-one focused tests pass; lint/TypeScript pass. Real decodable browser fixture, full exact-head CI and actual production canary remain release requirements. No production activation, database, financial, provider connection or account changes claimed.

## 2026-11-20 — immersive viewer browser correction

The first #253 browser run correctly caught wheel navigation being ignored when the pointer was over the full video surface button. Removed the overly broad button exclusion while keeping caption/link scrolling separate, and added a direct regression for surface-origin wheel events and momentum deduplication. Earlier core/critical CI passed; foundation had one setup-budget cancellation. Corrected-head CI and real canary acceptance are required before activation. No production activation occurred.


The corrected wheel browser run passes. Inspection then confirmed that publicSocialPosts read an RLS-restricted view that omits publication_status; the viewer's strict published guard therefore excluded genuine public social rows. The repository now explicitly labels only rows from that approved public view as published/source-available. Private management reads and all underlying consent/connection/publication/source policies remain unchanged. Existing real database flow coverage now asserts this viewer contract as well as hidden/draft exclusion. No private-table fallback or publication mutation was introduced.

Final fallback check preserves scrollable social content and native paused video controls when the immersive kill switch is off. The browser harness now explicitly checks this existing mode alongside the new viewer and reduced motion.

# GLOHAUS outstanding development audit — 30 October 2026

## Evidence and classification rules

Audited production commit `05b10132b553d954ecae594feb962c067550f9ac`, the open GitHub PR collection, production Supabase migration history and function/table metadata, security advisors, and real-domain GET responses. Existing design and financial settings are preserved. A deployed source file or passing fixture test is not authenticated production verification.

Production: `haroon-glohaus/glohaus1`, project `prj_dHz5OLhAjygs8hOKi99cgtGScgba`, deployment `dpl_EZ7yyuXk3dUDvYAgQdVt7kyx5k75`, https://www.glohaus.shop and https://glohaus.shop. Vercel reports READY. Public maintenance remains intentionally enabled; this prevents claiming that public booking/discovery/shop journeys are operationally verified.

LIVE AND VERIFIED below is restricted to the specific observed behaviour. PARTIAL includes deployed foundations whose complete authenticated/external journey remains unverified. IMPLEMENTED BUT UNDEPLOYED means source exists on a named PR; it does not imply production availability. BLOCKED identifies a separate release or launch dependency.

| Feature | Classification | Current evidence and next action |
| --- | --- | --- |
| Correct production target and domain assignment | LIVE AND VERIFIED | Vercel READY commit and both domain aliases inspected; no alternate project used. |
| Release CI cache repair | LIVE AND VERIFIED | #204 merged as `05b1013`; all 36 PR-head checks passed. Main checks: 17 passed, one full browser job still running at audit time; install, lint, typecheck, tests and build steps in that job have passed. |
| Maintenance response | LIVE AND VERIFIED | Real-domain GET `/` returns 503, temporary-unavailability title and Retry-After 3600. No lock setting changed. |
| Owner sign-in entry | PARTIAL | `/sign-in?returnTo=%2Fadmin` returns 200 and Owner/Admin heading despite maintenance. Browser title and nav label incorrectly identify customer sign-in; scoped correction in this release. Actual Owner credentials/MFA/session refresh still require authenticated checks. |
| Registration, recovery and session consistency | PARTIAL | Existing application and CI coverage retained. No new live account, password reset or verification email initiated. |
| Payments, refunds, disputes and withdrawal safeguards | PARTIAL | Current webhook handles refund-created/updated and dispute-created/updated/closed. Production functions `reconcile_external_booking_refund` and `sync_booking_dispute` exist. Focused isolated tests pass; no live charge, refund, withdrawal or disputed booking was created. Old #62/#64/#67 must not be merged wholesale over current implementation. |
| Booking-fee change | IMPLEMENTED BUT UNDEPLOYED | Draft #192 contains configurable standard/referral-first-booking proposal. Activation approval and backup/migration gates unresolved. Existing £1 policy retained; generic completion instructions do not establish a new amount or launch date. |
| Fourteen-day Founding policy and optional feedback | PARTIAL | Production history includes `20261029222902_founding_fourteen_days` and `20261029223246_founding_feedback_after_trial`. Preserve previous commitments. Authenticated timing/UI acceptance remains unverified. |
| Founding expiry Owner notices | IMPLEMENTED BUT UNDEPLOYED | Draft #194; matching production migration absent. Backup gate applies. |
| Unified referral/ambassador Stage 1 | IMPLEMENTED BUT UNDEPLOYED | Draft #193 remains the single intended foundation. Production has legacy customer/professional referrals and fraud review tables, not the new unified ledger. Keep all rewards off. |
| Reward launch, amounts, budgets and redemption | BLOCKED | Explicit channel launch approval still required. No automatic cash, credits or reward promises activated. |
| Business Hub and reporting accuracy | PARTIAL | #197 merged into current deployed ancestry. Reuse proceeds/repeat/retention/acquisition definitions; authenticated live-account reconciliation remains pending. |
| Personal links and professional launch guide | PARTIAL | Existing profile/invitation links and #199 launch guide included in production source. Consenting import and actual signed-in onboarding still separate. |
| Consenting client import | IMPLEMENTED BUT UNDEPLOYED | Draft #198; production import migration/table absent. Must not send messages, create accounts, grant marketing consent or attribution on import. |
| Academy cohorts and launch tracking | IMPLEMENTED BUT UNDEPLOYED | Draft #200; production academy migration/table absent. No automatic academy enrolment or new verification badges. |
| Consent-aware automated rebooking | IMPLEMENTED BUT UNDEPLOYED | Draft #201; production rebooking migration/table absent. Remains off; real sends and content/permission checks remain gated. Existing appointment reminders remain separate. |
| Discovery/map/styles/needs | PARTIAL | #202 is in current production ancestry. Public discovery is maintenance-gated; no claim of live customer search-to-booking verification. Existing fixture checks do not demonstrate demand/conversion. |
| Service/product selection links | PARTIAL | #203 included in deployed ancestry. Separate existing purchases, current stock/eligibility rechecks; no combined checkout, discount or reserved stock. Hosted authenticated journey pending. |
| Combined transactional bundles | MISSING | Intentionally deferred pending component quotes, stock races, refunds/fulfilment, financial allocation approval and operational demand. Selection links are not a combined bundle transaction. |
| Marketplace orders, uploads and reviews | PARTIAL | Existing routes and seller isolation/native-Postgres CI retained. Complete authenticated production order/fulfilment/refund journey not verified here. |
| Notifications, suppression and preferences | PARTIAL | Existing infrastructure and browser checks present. Real provider delivery, consented rebooking and installed-device push remain separate acceptance items. No outreach sent. |
| Social/calendar integrations | BLOCKED | Existing source is not proof of provider authorisation. Meta review/identity/provider permissions and user account actions remain external dependencies. |
| Mobile/PWA/loading/icons | PARTIAL | Real-domain manifest returns 200 with approved v3 icons, standalone display and theme colours. Existing browser-engine checks retained. Physical iPhone/Android installation, push, uploads and restarts require devices. |
| SEO robots and sitemap endpoints | LIVE AND VERIFIED | Real-domain GET `/robots.txt` and `/sitemap.xml` return 200 with canonical www host and private-route exclusions. Index coverage and public-page SEO remain maintenance/Search Console dependent. |
| Security | PARTIAL | Advisor flags leaked-password protection disabled. Thirteen private RLS tables have no direct policies (deny-by-default, not automatically a defect). Public site-status SECURITY DEFINER RPC intentionally exposes one boolean; verify exact grants/body rather than blindly revoking it and breaking maintenance. No database permissions changed. |
| Advanced subscription and AI assistant | MISSING | Deferred commercial proposals; no pricing, entitlements, AI provider costs or automatic business actions approved. |

## Verification in this audit

- 46 focused tests passed across Owner entry, dispute, refund finance, payout request database, maintenance indexing and launch SEO.
- A further 25 tests passed across updated Owner entry and existing messaging/navigation/history (includes five new sign-in title cases).
- Scoped ESLint and `git diff --check` passed for the sign-in correction.
- Production reads only: no customer records, provider settings, credentials, database schemas, pricing or commission settings changed.
- Supabase latest migration is still `20261029223246`; the newer referral/import/academy/rebooking release migrations are not applied.

## Exact remaining manual/release gates

1. Obtain a production backup through an authorised privileged database operator and restore-test it in an isolated environment. No managed restorable production backup or configured operator connection has been verified. Do not reset credentials, create privileged production roles or purchase a plan as a workaround. This gate applies before all production database mutations.
2. Complete isolated authenticated customer/professional/Owner screen checks with user-controlled sign-in and MFA. Do not enter credentials through model-visible tools or use real customer data as fixtures. Then complete safe authorised production account checks.
3. Explicitly approve any new standard/referral fee values and activation, reward channel amounts/budgets/launch and real promotional sends. Until then keep their safe defaults/off switches.
4. Resolve Meta/other provider identity and permission requirements in the relevant external accounts. Verify each provider journey after authorisation.
5. Perform physical iPhone/Android installed-app tests and Search Console inspection. Current browser emulation and sitemap GET checks are narrower evidence.
6. Review leaked-password protection availability and plan entitlement before enabling; no paid upgrade is authorised. Guidance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

These gates do not prevent scoped application-only fixes, read-only production inspection or isolated tests. Continue those independently. Never mark the whole platform complete while these acceptance items remain unresolved.

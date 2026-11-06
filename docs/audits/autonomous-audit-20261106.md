# GLOHAUS autonomous audit and reliability release — 6 November 2026

## Scope and protected baseline

Repository haroonayeni99-source/glohaus; production project haroon-glohaus/glohaus1; domain https://www.glohaus.shop. Baseline 57ff5f2af00ca8f3d7d79b985f0e14af382b1dd0 preserves the approved restored entrance and route transitions, analytics-off controls, Shop/Discover designs and current business rules.

No production customer/account/financial records, permissions, schema, fees, commission, referral rewards, maintenance switch, provider settings or account credentials were changed. Browser work used the already-signed-in Owner's own pages and existing test listings. No purchase, refund, transfer, promotional send, new registration or verification email was initiated. Social syncing is explicitly excluded. Normal read-only page views may produce existing operational visit telemetry; no optional behaviour collector was activated.

## Fixed and implemented in this controlled release

1. Availability API now rejects impossible calendar dates with INVALID_REQUEST before calling any database or external-calendar work. Previously Date.parse normalised dates such as 30 February, so expensive work ran before the slot domain rejected the date as an unavailable server request. Valid leap dates and Europe/London response remain unchanged.
2. Incoming booking links use the same genuine-calendar-date validation in the appointment picker. Malformed dates such as month 99 could previously throw during the display formatter; rolled-over dates are now ignored and the normal date choice remains available. Prices, deposits, clock/DST rules and final slot rechecks are unchanged.
3. Explore starts independent session presentation, postcode resolution and cached public taxonomy lookups together. It previously waited for them serially. Catalogue errors still reach the existing recoverable unavailable/retry state. Account data, professional visibility and availability are not newly cached.
4. Postcode provider coordinates are checked against the existing map-coordinate schema. Non-finite or out-of-range results safely fall back instead of reaching map positioning. Normalised full postcodes/outcodes, 3.5-second timeout and public-centroid caching are preserved; arbitrary town text is not sent to the postcode provider.
5. A cancelled follow-status JSON response cannot overwrite states belonging to newer map results. This prevents an old nearby-result response from undoing the latest saved-professional display. No follow/unfollow write was added or performed.

The old auth-session UI test harness lacked usePathname and matchMedia now used by the shared header. Those APIs were supplied in the fixture; no test assertions, application authorization or sign-out behaviour were removed to make the tests pass.

## Audit classifications by workstream

LIVE AND VERIFIED below means only the specific observed behaviour. Tests with mocks or isolated SQL are named as such and are not represented as provider/live transaction verification.

| Workstream | Classification | Evidence and limits |
| --- | --- | --- |
| Loading and transitions | LIVE AND VERIFIED for scoped behaviour | Existing release checked initial mounted artwork, Shop/Discover/profile local loading and no branded SPA replay; original themed artwork inspected at 320/390 and desktop widths. Latest release preserves those files. Physical PWA launch remains unverified. |
| Maps/search/discovery | PARTIAL | Live page offered all 32 unique boroughs; Southwark selection changed the route; SW1A 1AA returned nearby results; Nails filtering removed real Hair-only listings and retained clearly labelled fictional previews; Manchester produced a clear no-match recovery. Profile links and confirmed-coordinate Google Maps directions URL observed. The street map entered its supported browser fallback: real zoom/pan/pin interaction cannot be claimed verified in this cloud browser. No device-location prompt was accepted. |
| Design/navigation | PARTIAL | Approved rich design preserved. Live customer account groups bookings/history and notifications/communications logically; profile/Shop/Discover transitions checked. Existing responsive/theme/menu regression tests passed. Not every screen has a full keyboard or physical-device audit. |
| Registration/account journeys | PARTIAL | Signed-in session persisted across pages; customer account and settings loaded. Automated role, session, recovery, callback-origin and verification tests passed. No new account, verification delivery, password reset or logout was initiated against real services. |
| Professional profiles/tools | PARTIAL | Public test profile, service displays and professional dashboard loaded for the current authorised account, including existing verification-in-progress status. Full isolated service/gallery/policy/business-tool tests passed. Actual uploads/edits, provider ownership and physical-mobile editing remain unverified. |
| Booking/checkout | PARTIAL | Isolated DST/timezone, overlapping/duplicate booking, policy/deposit, checkout, cancellation and refund guards passed. Date-validation defects corrected before DB/provider work. No slot was reserved or paid in production. Calendar-provider latency and hosted payment completion still need isolated acceptance profiling; never bypass fresh calendar/slot checks to appear faster. |
| Shop/Marketplace | PARTIAL | Existing live Shop navigation checked and Owner's existing test basket loaded without errors; no item or quantity changed. Product/order/stock/checkout/refund/dispute isolated tests passed. No hosted purchase, seller fulfilment write or real refund was attempted. |
| Notifications/communications | PARTIAL | Live consolidated preferences page loaded with 11 controls and distinct activity/push/marketing sections; no preferences changed. Existing preference/suppression/deduplication/retry tests passed. Job metadata showed notifications success at 16:36 UTC and maintenance success at 16:00 UTC, zero failures in preceding 24 hours at inspection. This proves scheduled execution telemetry, not delivery to every provider/device. |
| Owner/Admin | LIVE AND VERIFIED for access/rendering; PARTIAL for actions | Existing signed-in Owner reached dashboard and sections for users, categories, bookings, orders, support, fee displays, commission, audit and health, with no alert elements. No search term containing customer information or administrative write was submitted. Delegated-role denials covered by isolated tests. |
| Engagement analytics | IMPLEMENTED BUT NOT ACTIVATED / BLOCKED | Owner engagement route loaded and explicitly showed Tracking is not activated. Consent/signatures/time/session/video/funnel/Owner-isolation tests passed. Production analytics schema is absent. Final staging update, backup verification, retention/alerting and production consent/conversion/device checks remain gates. No secret/configuration enabled. |
| Referrals/ambassadors/Founding | PARTIAL; newer foundations UNDEPLOYED | Existing qualification/abuse prevention/growth/database tests passed. Production unified reward ledger absent. Open proposals remain for referral foundation, academy cohorts, consenting client import, rebooking and Founding expiry notices. Existing promised benefits and reward-off state preserved. New reward amounts/financial activation remain Owner decisions. |
| Security/reliability | PARTIAL | Read-only audit: 145 beauty application tables have RLS. The only observed no-RLS table was the private migration ledger, which grants neither anon nor authenticated SELECT. The public security-definer RPC grants expose the intentional maintenance-status boolean; its body/search_path were checked, not blindly revoked. Leaked-password protection remains an advisor warning and is Owner/plan-dependent. No permissions or security settings changed. |
| SEO | LIVE AND VERIFIED for endpoints; PARTIAL for indexing | Live robots.txt names canonical www host/sitemap and excludes account/admin/API/private areas. Sitemap contained Home/Explore and excluded account/admin. Existing canonical/indexability/maintenance tests passed. Search Console/index coverage and every public metadata variant were not inspected. |

## Migration consistency (read-only)

- Custom migration ledger: 53 entries, all 53 names and SHA-256 checksums match local source; zero missing entries and zero checksum drift among these entries.
- Latest custom name: 20261029223246_founding_feedback_after_trial.sql. Latest applied timestamp: 29 October 2026, 22:33 UTC.
- Managed Supabase ledger: 157 entries, latest version 20261029223246.
- Repository plan: 178 entries. The 125 names outside the custom ledger are **not automatically 125 unapplied migrations**: the managed ledger and recovered/bootstrap history also exist. A complete two-ledger mapping is a separate prerequisite before any migration release.
- No SQL DDL/DML/migrations were applied by this batch. Analytics and unified referral schema checks remain false. Backup gate is unchanged.

## Verification evidence

Final full isolated run: **1,679 passed, zero failed, two skipped; 1,681 total tests across 206 test files**. Machine-readable per-file status is in autonomous-tests-20261106.json. Whole-suite baseline initially found seven failing session tests because of the stale fixture described above; all seven are restored and passing.

The two pre-existing skips are the real-HTTPS GOV.UK calendar/provider integration check and native concurrent seller-pause/cart-add acceptance. Neither is described as passing. Real external provider delivery and physical devices remain separate acceptance work.

New focused checks prove pre-provider impossible-date rejection, valid leap date handling, malformed booking-link recovery, independent lookup start ordering, catalogue-failure recovery, coordinate validation/provider fallback and late-response cancellation. Existing financial, auth, support, gallery, map, SEO, PWA, notification and analytics suites were retained. TypeScript, scoped ESLint, secret-pattern scan, git diff check and production webpack build passed before publishing.

## Evidence-based verification percentage

**20 of 24 named checkpoints = 83.3% verified to the stated depth. This is an audit verification score, not an estimate that 83% of the whole website or launch programme is finished.** Isolated checks do not become live checks by contributing to the score. There is no defensible single whole-platform build-completion percentage until the remaining backlog and provider/financial acceptance are weighted and agreed.

| # | Checkpoint | Evidence/state |
| --- | --- | --- |
| 1 | Correct project/domain baseline and controlled release | VERIFIED: Vercel project/aliases/commit |
| 2 | Initial branding and theme artwork | VERIFIED: live entrance plus actual-component theme checks |
| 3 | Ordinary page navigation avoids full entrance replay | VERIFIED: live Shop, Discover and profile |
| 4 | All 32 London borough options and selection | VERIFIED: live count/unique count and Southwark URL |
| 5 | Full postcode search | VERIFIED: SW1A 1AA query/results; provider/outcode logic isolated |
| 6 | Category/city no-result recovery | VERIFIED: Nails then Manchester; examples explicitly fictional |
| 7 | Public profile opening | VERIFIED: live authorised test profile |
| 8 | Directions handoff configuration | VERIFIED: confirmed-coordinate Google Maps URL; no journey/provider accuracy claim |
| 9 | Customer account/settings organisation | VERIFIED: live grouped routes |
| 10 | Professional dashboard entry | VERIFIED: existing authorised account; no edits |
| 11 | Owner dashboard entry and sections | VERIFIED: existing Owner/MFA session; no actions |
| 12 | Communication preference presentation | VERIFIED: live 11 controls; no writes |
| 13 | Auth/session/role safety regressions | VERIFIED: isolated suite plus live session persistence |
| 14 | Availability date/timezone safeguards | VERIFIED: isolated API/client/DST/duplicate-slot tests; no reservation |
| 15 | Shop/basket safeguards and rendering | VERIFIED: live existing basket plus isolated stock/cart tests; no purchase |
| 16 | Financial/refund/dispute safeguards | VERIFIED IN ISOLATION ONLY: native SQL/mocked providers; no real charge/refund |
| 17 | Scheduled-job execution health | VERIFIED: fresh success metadata; no delivery claim |
| 18 | Database RLS and public RPC boundary | VERIFIED: read-only metadata/body checks |
| 19 | Applied custom-ledger checksum integrity | VERIFIED: 53/53; full two-ledger mapping remains separate |
| 20 | Robots/sitemap public/private exclusions | VERIFIED: live endpoints plus isolated metadata tests |
| 21 | Real interactive map rendering, zoom/pan/pin sync | PARTIAL: fallback works; graphics interaction not verified in cloud browser |
| 22 | Live registration, email verification and recovery delivery | PARTIAL: isolated tests; no new account or real mail |
| 23 | Production consented analytics collection/conversion | BLOCKED: storage/configuration/backup/live acceptance gates |
| 24 | Installed iOS/Android PWA and physical Safari/Chrome | UNVERIFIED: physical devices unavailable |

## Remaining Owner-dependent and intentionally excluded

TikTok/Instagram/Meta authorisation and syncing, new provider permissions, paid upgrades, production backup/operator access, legal approval, new fee/commission/reward decisions and real financial operations are not attempted. No recurring interruption for them is needed. The new analytics activation remains off. The pending £1.50 proposal is not represented as the live booking fee. Refund-worker and other financial PRs were not merged wholesale.

## Controlled release and rollback

Only the five scoped source fixes, session fixture repair, new tests and this report are included, on top of the exact baseline. Published deployment identity and post-deploy observations are recorded in the final delivery message. Restore branch restore/before-autonomous-reliability-20261106 retains the baseline. Selectively revert this release or use that Vercel deployment if needed, preserving later work. Never restore/reset the database or credentials for an application rollback.

Recommended next independent batch: sandbox professional service/gallery/mobile editing and Shop fulfilment/dispute interface walkthroughs using synthetic data; complete migration-ledger reconciliation and backup-gated release preparation; broader keyboard/accessibility checks. A browser/device capable of the real map graphics path is still needed for map interaction acceptance. No blanket promise of instantaneous server/provider responses is made.

# GLOHAUS remaining-work checkpoint — 30 October 2026

Production target remains `haroon-glohaus/glohaus1`, `www.glohaus.shop`. This checkpoint does not authorize reward launch. No production database change, financial setting change, purchase or real payment action was made during this continuation.

| Area | Earlier status | Work completed / evidence | Production status | Remaining verification or blocker |
| --- | --- | --- | --- | --- |
| Owner access and recovery | Scoped fixes in #190 | Previously merged and deployed; five auth URLs returned 200 | Previously verified live | Authenticated Owner login/logout/refresh and installed-app restart |
| Booking fees | Existing £1 fee | Draft #192 adds configurable standard/promo amounts and eligibility; previous isolated/native tests passed | Unchanged; promotion OFF | Reconcile with new signup attribution, isolated hosted review, backup and separate activation; do not activate as part of disabled referral infrastructure |
| Founding terms and feedback | #189 and #191 | Previously deployed fourteen-day new offer and optional feedback; legacy commitments preserved | Previously verified live | Authenticated timing review |
| Founding expiry alerts | Local implementation | Published draft #194; 62 tests, TypeScript, lint and clean production build passed | Not deployed | CI, hosted staging and production backup |
| Referral foundation | Fragmented legacy paths | Draft #193 implements shared first-signup attribution, all four channels, qualification, risks, append-only ledger, financial caps and Owner tables | Not deployed; rewards OFF | Hosted signup/payment/Owner journey and verified restorable production backup |
| Referral + Founding integration | Both changed maintenance route | Integration branch retains both monitor calls and response fields; full suite: 191 files, 1,641 tests passed, four skipped; TypeScript/lint and clean build passed | Not deployed | Hosted browser review; native cap test already passed separately in #193 |
| Map regression checks | CI compared viewport positions across scrolling | Draft #195 compares document positions while preserving position/size checks; syntax/lint and both browser CI runs passed | Application unchanged | Remaining CI checks; no local Chromium available |
| Marketplace and Owner controls | Existing implementations | Included in combined passing automated suite; no redesign | Existing production implementation | Complete authenticated uploads, verification, reviews, support and control journeys |
| Social/calendar integrations | Existing provider code | Preserved | Existing production implementation | Provider account permissions/review and real provider round trips |
| Notifications, maps and PWA | Existing code and automated coverage | Combined suite passed; approved visuals preserved | Existing production implementation | Physical iPhone/Android installation, push, camera, uploads, navigation and session recovery |
| Security | Existing RLS/MFA/payment guards | Read-only production advisor review; public maintenance boolean function inspected | No security settings changed | Leaked-password protection requires Pro; review performance findings individually; no blanket policy/index changes |
| SEO and final QA | Canonical/robots/sitemap code exists; maintenance intentional | Existing SEO tests included in combined suite | Maintenance unchanged | Search Console access, public indexing and final authenticated hosted review |

## Verified source and test evidence

- Referral PR #193: `0ee887c5cca91b18dc18e840f90294571e218283`; all final checks passed previously. Native PostgreSQL referral-system job: 35 tests passed, including concurrent cap enforcement.
- Founding PR #194: `87cc7593d032577a9b8abfae9792528c7933251d`; tree `2be829cc61581d88a4a4860a26404d13dbe36831` matches the local tested source.
- Combined integration: `ff6685100ab9ddb2998e93bb3e9d390306706da1`; tree `1e1fba0dbb3edc4c429c89d99a3e99c72d75559b` matches local integration source before this documentation-only checkpoint.
- Full combined suite: 1,641 passed, four skipped. The local skipped native cap concurrency case passed in #193's native PostgreSQL CI. Skips are not described as local passes.
- Map assertion PR #195: `4a0a574036cf3b2ebf0e03d389e453c000bf0d88`; both discovery-map browser CI jobs passed.

## Release gates and current risks

1. Production `tyycrmmczsgnowditnii` is on Supabase Free. Its backup page explicitly excludes managed project backups. The available connector cannot export a complete restorable backup; no privileged migration/backup connection is available in this workspace. A manual dump plus restore verification, or an explicitly approved paid-backup route, is still required before **any** production database change. Supabase's official free-plan guidance recommends CLI dumps: https://supabase.com/docs/guides/platform/backups . No paid upgrade was made.
2. Existing isolated validation project `rqsyakggwmpkqzzogvll` was resumed and is healthy. Six older migration records were reconciled only after exact stored-SQL hash matches; 15 pending migrations were applied, bringing repository history to 184 entries. Referral/Founding migration checksums were read back. Hosted rollback-only smoke checks passed for actual Auth INSERT attribution, self-referral, one attribution, signup-only, immutable rules/truncation and both worker calls. Follow-up verification found zero synthetic accounts, zero rewards/events, no enabled channels and the emergency stop still active. This is database verification; hosted browser journeys remain unfinished. No production data was copied during this continuation.
3. Production dashboard reports an egress grace period ending 24 November 2026. Requests may be restricted if the quota issue is not resolved. This has not been fixed or financially authorized.
4. Leaked-password protection remains disabled; current Supabase documentation says Pro or above is required: https://supabase.com/docs/guides/auth/password-security . No subscription was added.
5. Read-only production advisors report 13 RLS-without-policy informational findings, two execution warnings for the same intentionally public maintenance-status boolean RPC, 44 foreign-key index suggestions, 72 unused-index suggestions and nine multiple-policy warnings. Counts are findings, not confirmed vulnerabilities. Do not add blanket policies or remove indexes without checking intended roles and query usage.
6. Historical device/IP/card/address evidence cannot be reconstructed. Shared signals require review. No physical-device or real-provider success is claimed.
7. No cash payouts, credit redemption, partner portals, reward promises or reward launch were introduced. All reward switches remain OFF. Existing Founding commitments and production booking fees are unchanged.

Drafts are reviewable source, not deployed functionality. Do not merge dependent application releases before their migrations and release gates are verified.

Hosted security advisors were rerun after staging migrations: 29 RLS-without-policy informational findings and the same two public maintenance-function execution warnings, with no new warning category. Private referral tables deny browser access and force RLS. The combined clean production build passed. `db/validation/referral_foundation_hosted_smoke.sql` records the rollback-only smoke checks.

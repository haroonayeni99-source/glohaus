# Owner engagement analytics — 6 November 2026

## Audit

Production baseline: 12a946149928796cb613c8b024dd3073018dc317, glohaus1 only. Existing revenue, customer acquisition, referral evidence, signed-in profile-open counts, operational job health and post likes/saves remain separate. Existing post engagement lives in src/modules/engagement and is preserved byte for byte. New behaviour analytics lives in src/modules/website-analytics. No GA, PostHog, Plausible, Clarity or Vercel Analytics client integration was found in package.json/source. Hosting-level injection has not yet been confirmed through a signed-in Vercel dashboard; do not turn on a second browser tracker without checking it.

Read-only production schema inventory found operational/payment event tables, but no page/session behaviour store. Existing profile referral consent is purpose-specific and is not reused. No historical engagement data can be reconstructed from booking records.

## Implemented and safe to deploy while disabled

- Owner-only /admin/engagement, linked in Owner quick actions and navigation. Existing pageAccount('admin') MFA gate plus explicit Owner role, and withOwner/database require_owner for reads. Delegated analytics.read permission cannot unlock this feature.
- Daily, 7-day, 30-day and custom UTC dates, maximum 93 days; mobile/tablet/desktop comparison and filtering. Raw data safety limit 10,000 page views per report: refuse incomplete totals, request a shorter period.
- Views, distinct consenting browser identifiers, sessions, mean/median page active time, average active session, maximum scroll, allowlisted click counts, ordered booking/shopping funnels, minimum-five-session aggregate paths and rule-based investigation flags (20 sessions, >=60s engagement, <2% conversion).
- Client snapshots update a single view id, with sequence deduplication. Visibility/focus and 30-second idle cutoff; delayed timer deltas capped at 2 seconds. New sessions after 30 minutes without interaction; visitor identifier expires after 30 days. Session identifiers are per tab. Refresh creates a new view; people cannot be deduplicated across devices or cleared storage.
- First-party Discover media only: >=50% visibility impression, actual visible/focused playback milliseconds, media coverage completion at 95%, completed-loop replay and profile clicks. Seeking, hidden/unfocused tabs, stalled media and paused playback are excluded. External embeds without telemetry are explicitly not estimated. Existing player/autoplay, feed layout and footer scrolling are untouched.
- Explicit optional analytics consent, equal allow/reject choices in a non-fixed inline region, persistent footer preferences. HMAC-signed HttpOnly/Secure/SameSite preference cookie, 180 days; purpose/version/expiry validation. No analytics identifiers before activation+consent. Withdrawal clears identifiers immediately, propagates across tabs and retains a local rejection override if the server save fails.
- Strict JSON allowlists/body size, same-origin POSTs, private/no-store responses, anonymous native-runtime wrapper for ingestion; no Supabase browser table grants. Snapshot counters and time bounds checked in HTTP and SQL. Per-visitor insert limits. Does not claim bot-proof analytics.
- Conversion proof is checked against the authenticated customer's paid booking/payment or paid product orders, with recent visit/reservation bounds; deduplicated opaque receipt digest, no customer identity in reports. Client checkout/profile clicks alone cannot mark completion. Booking conversion means a paid confirmed booking, not attendance/service completion. Attribution uses a consented pending checkout reference and browser return; payments completed without return may be missed. Existing financial reports remain authoritative.
- Isolated, authenticated daily retention endpoint, separate from payment maintenance. Cleanup targets 89-day-old rows to provide daily scheduling slack within a 90-day retention ceiling. Activation requires a successful scheduled retention verification; an outage must raise an operational alert rather than silently extend retention.
- Privacy policy disclosure updated. No form values, search text, raw URLs/query strings, messages, account IDs, precise location, IP addresses, full UA, payment credentials, session recordings, advertising or external tracker added. Hosting security/access logs are separate. Pseudonymous identifiers remain personal data where linkable; this is not represented as anonymous individual event storage.

## Activation gates and exact pending work

Production remains disabled by default: ENGAGEMENT_ANALYTICS_ENABLED must equal true AND a server-only ENGAGEMENT_ANALYTICS_SECRET of at least 32 characters must exist AND beauty.engagement_ready must succeed. No secret is hardcoded or emitted into public configuration. Do not enable merely to make the UI show numbers.

1. Verify a restorable production backup. Supabase dashboard currently reaches sign-in; available connector has no backup-status API. Prior backup release gate is preserved. No production schema changes have been applied by this analytics release.
2. Final SQL is deliberately under db/proposals/20261106120000_owner_engagement.sql, outside the migration runner. After the backup check, move the reviewed exact file into db/migrations, confirm migration checksums/state, apply only this additive migration and check advisor/RLS/function grants. Do not run unrelated pending migrations.
3. Initial schema applied to isolated validation project rqsyakggwmpkqzzogvll. Native tests verify SQL role isolation, deduplication, actual paid proof and retention. A final incremental staging bounds/retention update must be confirmed before production migration; connector confirmations expired on both attempts. Never claim a schema version was applied from an expired result.
4. Configure the secret securely, test through a protected preview with isolated storage, verify reject/accept/withdraw/reload/cross-tab and browser-return payment attribution. Do not run live charges for cosmetic/testing convenience.
5. Confirm no duplicate host-injected tracker, review the documented purpose/retention/provider arrangements and ICO guidance. This consent-first implementation does not rely on the statistical-only exception for retained session-level records. A documented privacy assessment remains required before activation.
6. Verify the daily retention cron and alert path, then enable on glohaus1 and perform a consenting production smoke test. Verify real Owner login/MFA and denial to a normal Admin, customer, professional and anonymous session. Reconcile observed paid conversions with existing trusted financial totals, acknowledging opt-in/return coverage limits.
7. Physical iPhone Safari, Android Chrome, installed iOS/Android PWA device checks remain pending. Responsive DOM/layout checks in cloud Chrome are not substitutes for those devices.

## Validation and rollback

Targeted regression run: 169 tests passed (12 files), including existing posts, Discover footer/video, booking payment API, cart, theme and admin route contracts. New tests cover time/median/funnel/date rules, privacy endpoints/signatures, actual browser collector with simulated media, Owner access and native Postgres SQL role/paid-receipt/retention cases. TypeScript and production webpack build passed; final changed-file lint and webpack rebuild also passed. Responsive layout checked at 320, 390 and 820 CSS pixels with contained table scrolling, light/night; desktop checked at 1260 CSS pixels with no document overflow.

Rollback is selective source revert/Vercel deployment rollback to baseline; no database rollback or credential reset. Disabling ENGAGEMENT_ANALYTICS_ENABLED stops collection independently. Existing payments, fees, records and roles are not rewritten. Preserve later unrelated commits when reverting.

## Other outstanding work reviewed

| Work | Current disposition |
| --- | --- |
| Discover original snapping/positioning and page footer; homepage search alignment; one-click Light/Night | Preserved from verified baseline; no redesign in analytics release |
| TikTok/Meta automation | Approval/account verification gates remain; not enabled by analytics |
| Referral rewards, academy cohorts/client import, Founding notices, booking-fee migration | Separate schema/business release gates; not activated or merged as part of analytics |
| Refund-worker follow-up | Financial change; separate regression/release review required |
| Academy enquiry public page / messaging style PRs | Open proposals; not represented as live or silently merged |

Official privacy references: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/ and https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/ . Current guidance distinguishes aggregate statistical analytics from retained individual/session tracking; prior explicit opt-in is used here.

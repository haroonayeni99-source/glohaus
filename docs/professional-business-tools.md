# Professional business tools — implementation and release evidence

Scope: the approved 27 October 2026 improvements. Preserve existing design, loading screen, authentication, payments, fees, commission, wallet and payout arrangements. Repository protections in AGENTS.md apply.

## Baseline reused

Existing working hours, manual time-off blocks, variable service durations, temporary payment holds, atomic professional booking locks, verified completed-booking reviews, professional responses, reporting/moderation/appeals, portfolios, Discover, founding entitlements, Owner programme controls and the existing notification scheduler remain the foundation.

Production target was independently checked: `glohaus1`, project `prj_dHz5OLhAjygs8hOKi99cgtGScgba`, team `team_bt39lAKNGwFdn1g6Lynl2MrT`, domains `www.glohaus.shop` and `glohaus.shop`. Existing Pro scheduling supports its hourly maintenance/every-minute notifications; the old Hobby project is not the production target. No plan upgrade or paid scheduler is required or purchased.

## Implementation

- Business Tools links to connected calendars and social media in one scoped dashboard page. Existing navigation remains present. Working hours and portfolio pages link to their corresponding connection tools.
- Google primary calendar and Outlook default calendar OAuth, state validation, PKCE where supported, encrypted server-side tokens, refresh handling, explicit permission/optional write consent, successful-sync timestamps, failures, reconnect and disconnect. API sign-ins remain disabled until separately configured and approved.
- HTTPS ICS subscriptions with encrypted feed URLs, DNS/IP validation, pinned addresses, no redirects, response/time limits, recurring events, cancellations/exceptions and embedded timezone support. Unsupported feeds fail visibly. All-day/floating ICS dates follow Europe/London. Google all-day dates currently support UK/UTC calendar timezones; other all-day timezones reject instead of guessing. The professional must include other booking platforms' appointments in the connected calendar. One primary/default calendar per provider; up to eight logical connections overall.
- Manual blocks stay intact. Optional 0/15/30-minute appointment buffers and extra travel buffers apply around busy intervals. The database protects reservations and reschedules under the professional lock. Calendar refresh happens before creating a booking hold and before a reschedule; existing temporary holds and payment handling are preserved. The extra guard applies only after enabling buffers or calendar connections.
- Provider calendar notifications and scheduled recovery. Subscription renewal has polling fallback. Calendar/booking changes queue refreshes; a bounded worker reuses the existing server scheduler without changing its cadence. Snapshots replace only after complete import, preserving old data on errors. Stale/error/pending connected calendars pause new availability rather than silently showing it as synchronised. Explicit disconnection removes external blocks. No instant-sync or universal conflict-prevention guarantee.
- Optional exports add private GLOHAUS appointment events without client names. Stable Google event IDs, Outlook transaction IDs and stored event mappings avoid repeated creates; own exported events are excluded from imported busy intervals. GLOHAUS remains the source for booking cancellation/rescheduling. Disconnecting forgets tokens and hides imported social content; existing exported appointments may remain externally.
- Official Instagram/TikTok account adapters import eligible public content and actual creation dates. New posts default to draft; automatic publication is opt-in. Hidden posts stay hidden after sync. A complete import marks removed/restricted posts unavailable. Direct full post links work without API credentials; no scraping, account passwords, invented dates or engagement.
- Portfolio controls select, publish, hide, remove and order content, associate services, and display current starting prices and service booking links. Existing profiles and Discover show opted-in public work. Third-party embeds require a visitor click; original links remain available when embeds are unavailable. Reporting reuses the existing professional reporting route; captions identify the source platform.
- Guided reviews reuse completed-booking eligibility, duplicate prevention, professional replies, balanced moderation and appeals. Overall rating is required without a preselected positive value; text and six structured questions are optional. Structured answers and suggestions remain private between booking participants. One optional relevant JPEG/PNG/WebP review photo, up to 3 MB, requires explicit public-display consent, is sanitised to strip metadata, and is served only while the linked verified review is visible. Sensitive concerns use existing private support. The existing post-completion review invitation is preserved.
- Owner Platform Health shows aggregate integration adoption/status and successful/failed sync counts. DB permissions expose no token values, private appointment titles or private suggestions. Connection status/sharing changes have audit entries. Existing review moderation and reports remain in place.

## Provider setup and release gates

At inspection, production contained no Google Calendar, Microsoft Calendar, Instagram or TikTok OAuth app credentials. The existing Google Routes key is unrelated and was not reused.

Use the server-only variables documented in `.env.example`. Callback origin derives from the canonical `GLOHAUS_PUBLIC_URL`; register its exact callback per provider. Keep production credentials out of preview environments. Never rotate the encryption key without migrating existing ciphertext. Do not switch an `*_ENABLED` flag on merely because a secret was added.

Before public OAuth activation, obtain the provider's appropriate developer app/permissions/approval and test with an authorised professional account: consent/denial, expiry/reconnect/revocation, recurrence and timezones, cancellation/rescheduling, external writes and retries, notifications/renewal, deleted posts, and cross-account separation. Existing unit/isolated-database tests are not evidence of these external journeys. Instagram's supported API version must be set from the approved app's current documentation. Google/Outlook currently expose only primary/default calendar support; account-wide multiple-calendar selection needs a later extension.

## Communications and legal review

The current homepage/About copy already uses GLOHAUS/we language and keeps detailed terms on policy pages. No unrelated homepage or legal-policy rewrite was made. Reusable recruitment copy is in `docs/professional-recruitment-copy.md`; it describes current benefits and avoids presenting unconfigured connections as live.

No existing fees, commission rates, founding 14-day/feedback 30-day terms, programme closure/retirement controls, refund rights or liability terms are changed. Obtain UK legal review of any material policy amendments and of the connected-account privacy/retention wording before broad external-account rollout. Draft topics: encrypted OAuth permissions/feed links; retained busy-time windows; private feedback versus public photos; third-party embedded content after visitor choice; access revocation and deletion. No new liability exclusion is introduced.

## Costs and limits

No new paid subscription, hosting plan or scheduler was purchased. Existing Vercel function, database and private Blob usage can increase with synchronisation, photo storage/traffic and portfolio traffic. Provider quotas and any applicable provider charges must be checked for the approved developer apps; this report does not assert a zero-cost guarantee. Polling, connection count, pagination, response size, token refresh and worker limits bound activity but are not a fixed monthly bill cap.

## Validation / deployment record

See the PR/release report for final check results and deployment SHA. Tests cover encryption/auth-state binding, safe URLs/IPs, ICS recurrence/cancellation/DST, pagination failures, exported-event exclusion/idempotency, genuine social dates, review consent, RLS separation, buffer/external/stale booking conflicts, unchanged baseline fees and new-tool adoption. Browser fixtures exercise real components with fictional data and intercepted writes; mobile dimensions are Chromium emulations, not physical iPhone/Android or Safari verification.

Not verified until explicitly recorded: real professional Google/Outlook/Instagram/TikTok sign-ins; provider review/approval; production account-based ICS connection; real new review-photo upload; physical-device and Safari behaviour. Do not describe these as complete external integrations or guaranteed double-booking prevention.

## Rollback

Keep the previous READY `glohaus1` production deployment as the application rollback candidate. The schema is additive except for allowing optional review text, and old application routes remain compatible. A rollback must first pause/disconnect newly connected calendars and reset optional buffers while preserving records; otherwise the database correctly retains their conflict guards even when the old dashboard lacks their controls. Do not drop new data or overwrite historical migrations as a rollback shortcut. Provider credentials can remain disabled while the independent review/manual-link features are released.

Official references: https://developers.google.com/workspace/calendar/api/v3/reference/events/list ; https://developers.google.com/workspace/calendar/api/guides/push ; https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0 ; https://developers.tiktok.com/docs/display-api-overview/ ; https://developers.tiktok.com/docs/embed-player/ ; https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/ ; https://supabase.com/docs/guides/database/postgres/row-level-security .

### Local validation recorded 27 October 2026

- `pnpm test --maxWorkers=2`: 176 files passed; 1,492 tests passed and one existing skip, plus both Node-runtime security-floor checks passed.
- `pnpm lint`: zero errors; two existing image warnings in the unchanged loading screen.
- `pnpm typecheck`, production build and secret-pattern scan passed.
- `scripts/check-business-tools.mjs`: eight successful Chromium device-size/theme combinations. Controls, private feedback, rating-only negative reviews, failed-save retries and click-to-load embeds checked; new page has no horizontal overflow at tested widths. Screenshot evidence reviewed in both theme directions.
- Production-server browser regressions: 49 passed and one existing skip across desktop/mobile projects. The isolated environment deliberately had no database/auth credentials; expected unavailable states and external-image DNS failures were observed, so this does not verify live authentication, payment or external-image delivery.
- API adapters and permissions are tested with fixtures. No live Stripe sandbox transactions or external-account OAuth consent flows were run.

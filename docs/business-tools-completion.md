# Approved business tools: completion record

This record covers the approved instructions in `Pasted text(8).txt` and releases #175, #176 and #177. It distinguishes working implementation from external account acceptance. Keep current loading screens, authentication, payment arrangements, fees, commission rates and programme entitlements intact.

## Scope checklist

| Approved area | Implemented and checked | Remaining acceptance |
| --- | --- | --- |
| Calendar and availability | Working hours/manual blocks, duration/travel buffers, booking holds and conflict guards; encrypted ICS imports; repeat/moved/cancelled events; error/stale handling and disconnect; actual public HTTPS feed import | An authorised professional's private feed connected through the live dashboard; confirm blocked/moved/cancelled slots and disconnect |
| Google and Outlook | Official server adapters, state/PKCE, encrypted refresh tokens, least-privilege read scopes, optional booking exports, provider notices and scheduled retry; fixtures exercise failures and cross-account separation | Platform-owned developer app credentials, required provider approval, authorised consent/denial/revocation/expiry and export checks; primary/default calendar support only |
| Instagram and TikTok | Official API adapters; genuine creation dates; manual links; draft/automatic publication choice; selection/order/service association; profiles and Discover; click-to-load embeds | Platform-owned developer app credentials/approval and live eligible-account import, expired/deleted/restricted content checks |
| Guided reviews | Completed-booking checks, duplicate protection, optional text/questions/private suggestions/photo, professional responses, reporting/moderation/appeals | Live photo submission by an authorised customer with a genuine completed booking; no fabricated production booking or public review |
| Communication | Benefits-first we/our recruitment copy; founding 14-day and eligible feedback 30-day terms; existing pricing and Owner closure/retirement controls preserved | No outreach was sent as part of this implementation |
| Legal presentation | Existing concise homepage and links to fuller policies preserved; no material legal-policy amendments | Appropriate UK review of connected-account privacy/retention wording before broad OAuth rollout; this implementation is not legal sign-off |
| Dashboard and oversight | Tools connected to existing navigation; connection health, adoption and sync counts; role/RLS boundaries and audit records | Signed-in professional/customer/Owner acceptance where the relevant live account is required |
| Device and release checks | Chromium emulation; WebKit engine coverage; backend, production-server browser, availability and auth-boundary checks; existing deployment/rollback workflow | Physical iPhone/Android and actual Safari verification require those devices; emulation and WebKit are not physical-device evidence |

## Review-photo full-path checks

`tests/review-photo-flow.test.ts` runs the actual review submit/photo-serving routes, account authorisation, complete database migrations/RLS and Sharp sanitisation in an isolated database. Signed-in identity and private Blob network transport are fixtures. It verifies signed-out rejection, completed-booking ownership, consent, negative rating-only reviews, EXIF removal, private serving, duplicate cleanup, rollback cleanup, moderation hiding and storage failures. It does not create production customers, reviews, bookings, messages or Stripe transactions.

The flow exposed an error-classification problem: storage outages were being returned as invalid image input. The route now returns invalid-input responses only for failed image sanitisation and retains the existing unavailable/retry response for a storage outage.

`scripts/check-business-tools.mjs` exercises actual components with intercepted writes in Chromium and WebKit. Each engine checks eight device-size/theme combinations, including the enabled ICS form, photo consent and browser FileReader payload, retained input after a failed save, negative reviews and click-to-load social embeds. Async embed-close assertions wait for the rendered result instead of reading React state immediately after a click. Reports and screenshots are retained by the dedicated workflow.

## Exact configuration still required

Production's canonical origin was read as `https://www.glohaus.shop`. The independent `BUSINESS_TOOLS_ENCRYPTION_KEY` is already configured as a production-only sensitive secret, enabling supported read-only ICS subscriptions. Preserve it while connections exist. No provider OAuth client credentials, enable flags or managed Vercel Connect installations were present when checked.

| Provider | Callback | Server configuration |
| --- | --- | --- |
| Google Calendar | `https://www.glohaus.shop/api/v1/professional/connections/google/callback` | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_ENABLED` |
| Outlook | `https://www.glohaus.shop/api/v1/professional/connections/outlook/callback` | `MICROSOFT_CALENDAR_CLIENT_ID`, `MICROSOFT_CALENDAR_CLIENT_SECRET`, `MICROSOFT_CALENDAR_ENABLED` |
| Instagram | `https://www.glohaus.shop/api/v1/professional/connections/instagram/callback` | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, approved `INSTAGRAM_API_VERSION`, `INSTAGRAM_ENABLED` |
| TikTok | `https://www.glohaus.shop/api/v1/professional/connections/tiktok/callback` | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_ENABLED` |

Use only platform-owned approved developer credentials. Connected personal Calendar tools and the unrelated Google Routes key cannot provide the app credentials required by professionals using GLOHAUS. Never put secrets in chat, code, logs, browser props or previews. Credentials alone do not establish public approval; keep the provider disabled until its required consent and account tests are authorised and completed.

The attempted secure GLOHAUS sign-in timed out and the browser environment restarted. A fresh browser showed the professional sign-in page, so no successful live account authentication was recorded. Continue via the secure browser handoff; do not substitute direct database access for professional/customer consent or claim that isolated identity fixtures verified a live login.

## Release evidence and cost

Local validation before PR #177: 1,516 tests passed, two skips (one existing and the opt-in network case), plus both Node-runtime checks; lint had zero errors and only the unchanged loading-screen image warnings; typecheck, secret scan and a clean production build passed. A restored build cache initially failed and was set aside before the clean build. Dedicated CI ran all 25 calendar/photo tests, including the real public GOV.UK HTTPS import; both engines completed all 16 form scenarios on the initial PR commit. Final CI, deployment SHA, aliases, live checks and any duplicate-run failures are recorded on PR #177.

No new service subscription, paid scheduler or hosting plan was purchased. Existing build/runtime, database, private Blob storage/traffic and provider quotas still apply. These tests do not establish a fixed zero-cost bill. Production release and rollback candidates are checked through the existing `glohaus1` project.

Official setup references: [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [Microsoft calendarView](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0), [TikTok Display API setup](https://developers.tiktok.com/docs/en/display-api-get-started), [Instagram Login API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/). The Instagram documentation returned a rate-limit response during this follow-up; its current approval/configuration requirements still need to be verified in the developer app before activation.

# GLOHAUS provider submission packet

Prepared 12 November 2026. Draft material, not a submitted review or evidence of provider approval. Use real consenting test accounts; never invent credentials, screenshots, approvals or successful API calls. Existing WORK_LOG evidence remains authoritative.

## TikTok production application

App: https://developers.tiktok.com/app/7704607254674278420

Description (under 120 characters):

> GLOHAUS helps customers discover and book beauty professionals, who can showcase their work in a portfolio.

Products: Login Kit and Display API. Requested scopes: `user.info.basic`, `video.list`, matching `src/modules/business-tools/oauth.ts`. Web callback: `https://www.glohaus.shop/api/v1/professional/connections/tiktok/callback`.

Terms: https://www.glohaus.shop/terms . Privacy: https://www.glohaus.shop/privacy . Choose Web; do not declare native Android/iOS apps solely because a PWA exists. Select the closest category actually offered by the console. Upload the approved GLOHAUS icon at 1024 × 1024, JPEG/PNG, at most 5 MB; do not substitute an unapproved logo.

App review explanation (under 1,000 characters):

> GLOHAUS is a beauty discovery and booking website. Professionals choose to connect their own TikTok account using Login Kit. user.info.basic identifies the connected account; video.list lets the Display API retrieve its eligible public videos for portfolio selection. GLOHAUS does not publish to TikTok. Professionals can refresh imported work, manage its visibility and disconnect. Portfolio items can link customers to the professional's existing GLOHAUS services. The attached recording must demonstrate the actual sandbox flow and publication controls. Public OAuth remains disabled while review is pending. Access does not depend on the professional's GLOHAUS verification status.

Do not submit this text with a recording until the private-import policy below is implemented and accepted. Confirm reviewer access instructions against the actual console requirements; supply credentials through its private reviewer fields only.

## Instagram review

Existing review: https://developers.facebook.com/apps/1812717093254725/app-review/submissions/?submission_id=1812721253254309&business_id=1596937934898418

Purpose text:

> A consenting beauty professional connects their own eligible Instagram Business or Creator account to select their media for a GLOHAUS portfolio. instagram_business_basic supports account identification and retrieval of that account's eligible media. GLOHAUS does not publish to Instagram. Professionals manage GLOHAUS portfolio visibility and can disconnect their account.

The accessible review lists `instagram_business_basic` and `public_profile`; code requests `instagram_business_basic`. Confirm the configured production app identity and review requirements before changing scopes. Preserve existing permissions until assessed. Business verification was already observed as Verified; do not repeat it.

Callback: `https://www.glohaus.shop/api/v1/professional/connections/instagram/callback`.
Deauthorisation: `https://www.glohaus.shop/api/webhooks/instagram/deauthorize`.
Data deletion: `https://www.glohaus.shop/api/webhooks/instagram/data-deletion`.

Owner must truthfully complete controller identity/country, actual processors, government/national-security request history and actual request-handling practices. Technical implementation cannot establish those declarations.

## Real recording script for each provider

Record an uninterrupted demonstration using an authorised sandbox/test professional and their own media. Hide credentials, tokens, developer secrets, MFA codes and unrelated account data. TikTok accepts mp4/mov, up to five files of at most 50 MB each, as observed in its console.

1. Open GLOHAUS professional Connections and show the current provider status.
2. Click Connect. Show the genuine provider consent screen and requested permissions. Pause recording for credentials; resume after authentication without implying consent was simulated.
3. Complete the real callback. Show the connected identity and successful sync status.
4. Import eligible work. Show the result as a private draft, absent from the public profile before publication. **This is an unfulfilled software acceptance gate: existing automatic mode can publish work. Do not record or describe a draft-only journey as complete until fixed and tested.**
5. Explicitly publish one item, link it to an existing service, then open its public profile in a separate signed-out session. Show source attribution and the existing booking entry point; do not pay.
6. Hide the item and verify it disappears publicly; restore it to a draft and verify it stays private.
7. Refresh and show duplicate prevention. Disconnect and demonstrate the actual resulting visibility and connection state.
8. Attach the real recording and write only observed reviewer steps. Do not claim non-test public access until provider approval and a real ordinary-professional test pass.

## Calendar setup and acceptance handoff

Google console: https://console.cloud.google.com/apis/credentials . Microsoft console: https://entra.microsoft.com/ . Configure the existing application, not a duplicate, where one exists.

| Provider | Existing callback | Existing server settings |
| --- | --- | --- |
| Google | `https://www.glohaus.shop/api/v1/professional/connections/google/callback` | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_ENABLED` |
| Microsoft | `https://www.glohaus.shop/api/v1/professional/connections/outlook/callback` | `MICROSOFT_CALENDAR_CLIENT_ID`, `MICROSOFT_CALENDAR_CLIENT_SECRET`, `MICROSOFT_CALENDAR_ENABLED` |

No matching Google/Microsoft production credential keys were present in the environment metadata inspected this session. Keep secrets in the provider/Vercel UI. Shared encryption configuration already exists; do not replace it. Google requests calendar.events.readonly or calendar.events when export is chosen; Microsoft requests offline_access and Calendars.ReadBasic or Calendars.ReadWrite. Confirm required provider consent/review for the selected access.

Real-account checklist: consent denied; successful connect; overlapping busy event blocks a slot; booking export; reschedule updates the same event; cancellation removes/cancels it; expired/revoked grant prompts reconnect; network failure preserves safe availability; reconnect does not duplicate events. Record event IDs privately and inspect both systems. These are pending acceptance steps, not completed tests.

Apple-compatible .ics download is deployed via #234. It is a one-time export. No outbound private-token subscription feed exists yet. Existing inbound ICS busy feeds are a different feature. Never describe either as verified two-way Apple sync.

## Isolated acceptance prerequisites

Vercel: https://vercel.com/haroon-glohaus/glohaus1/settings/environment-variables . Branch: `fix/isolated-preview-auth-20261112`, Preview only. Existing three base DB/auth variables are present; do not recreate them. Isolated-auth opt-in was added this session and exact implementation commit redeployed.

Supabase validation project: https://supabase.com/dashboard/project/rqsyakggwmpkqzzogvll/auth/url-configuration . Allow the exact rebuilt Preview callback origin for signup/recovery; never relax production redirects. Supply disposable customer/professional acceptance identities through secure browser sign-in. No production accounts or data should be copied.

Uploads additionally need a separate non-production `BLOB_READ_WRITE_TOKEN`. Payments need a sandbox `STRIPE_SECRET_KEY`, matching platform/Connect webhook signing secrets, restricted isolated `PAYMENT_DATABASE_URL` and its verified TLS CA. Inspect database TLS requirements before adding missing public CA configuration. Reuse existing valid isolated settings where available; never recreate deleted credentials or use production settings to get acceptance passing.

Register sandbox webhook routing to the exact acceptance deployment's `/api/webhooks/stripe` and verify delivery, booking/payment/ledger agreement and replay idempotency. No live charge or payout is authorised. Historical PAYMENT-SANDBOX-SETUP production instructions are superseded for current isolated acceptance.

Owner security: https://www.glohaus.shop/security . Existing owner session reached the authenticator gate, which requires verification within 12 hours. Use the existing authenticator when enrolled; otherwise enrol personally and keep recovery information private. Never send codes or QR secrets in chat.


## 13 November continuation: exact remaining calendar setup

No Google Calendar or Microsoft Calendar OAuth credential bindings were present in Vercel metadata. Do not confuse GOOGLE_ROUTES_API_KEY with calendar credentials. Google console returned Site Unavailable in this browser; Entra redirected to Microsoft Azure sign-in. No app was created or modified, no consent was granted.

Google: open https://console.cloud.google.com/apis/credentials in the existing GLOHAUS project. Enable Google Calendar API; configure Google Auth Platform audience as External for public professionals; add the owner's Google email as a test user while in Testing. Reuse an existing Web application OAuth client if present. Authorised redirect URI: https://www.glohaus.shop/api/v1/professional/connections/google/callback . Requested scopes: https://www.googleapis.com/auth/calendar.events.readonly for busy import, or https://www.googleapis.com/auth/calendar.events when optional booking export is selected. Client ID/secret belong under GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET; keep GOOGLE_CALENDAR_ENABLED off pending approved configuration release and real acceptance. Complete Google's actual verification requirements before claiming public availability.

Microsoft: open https://entra.microsoft.com/ and App registrations. Reuse existing GLOHAUS registration; Supported account types must be Accounts in any organizational directory and personal Microsoft accounts (AzureADandPersonalMicrosoftAccount). Add Web redirect https://www.glohaus.shop/api/v1/professional/connections/outlook/callback . Delegated Graph permissions: Calendars.ReadBasic for busy import, Calendars.ReadWrite for optional exports; offline_access for refresh. Save Application (client) ID and client-secret VALUE securely as MICROSOFT_CALENDAR_CLIENT_ID and MICROSOFT_CALENDAR_CLIENT_SECRET; MICROSOFT_CALENDAR_ENABLED stays off pending approved activation. Do not use the secret ID. Tenant-specific consent/admin policy can still restrict work accounts; /common does not override tenant policy.

Save credentials through Vercel's secure UI only, never chat. Production environment changes require owner approval; they have not been performed. First acceptance uses only owner's authorised calendars and disposable appointment events, with GLOHAUS as source of truth. Current callback origin validator permits only glohaus.shop/www.glohaus.shop, so a Preview URL is not an approved real OAuth callback. Fixture evidence cannot substitute for live consent or a real callback.

Sources checked: https://developers.google.com/identity/protocols/oauth2/web-server ; https://developers.google.com/workspace/calendar/api/auth ; https://learn.microsoft.com/en-us/security/zero-trust/develop/identity-supported-account-types .

Private import fix proposed in current PR: SOCIAL_AUTO_PUBLISH_ENABLED is OFF when absent. Worker imports new social work as drafts even for legacy automatic connections; API rejects enabling automatic publication; UI offers approval/manual modes while off. Existing public/hidden choices remain preserved. No DB migration and no production flag change. Genuine review recording must follow release of this fix and actual authorised provider connection; no demo or submission has been fabricated. Meta legal declarations and TikTok app review remain owner/provider-dependent.

## 22 November 2026 — current evidence and Google submission preparation

The Owner reports creating the Google Cloud project, enabling Calendar API, configuring consent and creating Web client **GLOHAUS Website** on 22 November. Do not recreate these. This browser returns **Site Unavailable** for Cloud credentials, so branding/audience/test-users/scopes/client settings/publishing/verification remain unverified.

Vercel metadata read (decrypt=false): no Google Calendar or Microsoft Calendar keys and no production TIKTOK_CLIENT_ID/SECRET appear in the returned key inventory. Existing Instagram production credentials, API version/test allowlist and TikTok sandbox credentials/allowlist exist. Production alias is glohaus1 deployment dpl_AASv7Y1WQryx2YTkYBW8sEfTPqdp, main 31696b9. Never infer approved access from these bindings. No secret values were requested.

Meta application 1812717093254725: dashboard observed **Review in progress**, requests instagram_business_basic and public_profile, Required actions 0, application Unpublished. Verification page says Business **Verified**. Existing submission 1812721253254309 contains the private-draft portfolio description and an attached playable 37-second video. The details page labels “Your request results for November 14, 2026 at 01:29 GMT”; this is not proof of a 21 November submission date. Attachment existence/playability does not establish the full consent flow is demonstrated. Basic settings contain correct privacy URL/site URL; Terms URL and general data-deletion instructions URL were blank. Instagram-specific lifecycle settings must be checked separately. No review was withdrawn/resubmitted and no legal declaration changed.

TikTok existing app page requires developer email/password sign-in; current review status, submission date, product/scopes and recording contents cannot be provider-verified here. Owner reports submission around 21 November. Microsoft Entra is at account selection, with personal Microsoft accounts shown; directory/registration details remain unverified. No duplicate app was created.

### Google verification draft (copy after checking the existing project)

App name: GLOHAUS. Home: https://www.glohaus.shop . Privacy: https://www.glohaus.shop/privacy . Terms: https://www.glohaus.shop/terms . Authorised domain: glohaus.shop (verify ownership through the actual console). Support/developer contact: use the Owner-controlled mailbox already configured; do not invent one. Web origin: https://www.glohaus.shop . Callback: https://www.glohaus.shop/api/v1/professional/connections/google/callback . Keep the existing External audience and test users; verify actual publishing state before changes.

Purpose: GLOHAUS lets independent beauty professionals connect their own primary Google Calendar to keep their GLOHAUS availability consistent with existing appointments. With separate optional booking-export consent, it creates and updates private calendar events for GLOHAUS bookings. GLOHAUS remains the booking system of record.

Scope justification: calendar.events.readonly retrieves event IDs, start/end times, cancellation and transparency status to block unavailable slots, including recurring instances. Event titles, descriptions and attendees are excluded from API field selection. calendar.events is requested only when the professional chooses booking export, allowing creation, rescheduling and removal of private “GLOHAUS appointment” events containing times, without customer names/contact details or treatment notes. Both scopes are full https://www.googleapis.com/auth/ URLs in Data Access. Do not request unrelated Gmail/Drive/Contacts access.

Recording remains genuine-account work: show app/home/privacy, existing Google OAuth client identity, actual consent with selected scopes, callback, imported overlapping busy event, explicit booking export, reschedule of the same mapped event, cancellation and reconnect without duplicates. Mask credentials/tokens and unrelated calendar content. Do not replace this with fixtures or claim a video exists when not recorded. Check Google's actual verification checklist, including any required Limited Use policy statement, against the Owner's real practices before submission.

Technical acceptance can use GOOGLE_CALENDAR_TEST_PROFESSIONAL_IDS and MICROSOFT_CALENDAR_TEST_PROFESSIONAL_IDS for exact professional IDs after secure credential configuration, without enabling public access. These application allowlists do not bypass Google's test-user list, Microsoft tenant consent or provider approval. Keep public *_ENABLED flags off until genuinely ready.

Apple subscription code uses a separately proposed additive table in db/proposals/20261122_calendar_subscriptions.sql. It is intentionally excluded from production migrations. CALENDAR_SUBSCRIPTION_ENABLED defaults off; do not enable until recovery arrangements, reviewed schema application and hosted acceptance are verified. One-way polling exports minimal appointment times/status, 90 days past/366 days future, stable UIDs, UTC, cancelled tombstones, revocable encrypted links and no customer details. Existing inbound ICS and single-booking download remain separate. True two-way Apple sync would require a separate authenticated CalDAV integration/conflict model, not an Apple OAuth approval.

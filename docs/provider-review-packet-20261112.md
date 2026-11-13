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

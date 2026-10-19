# Journey, PWA, notifications and payments verification

Requested by Haroon on 18 October 2026. Existing application and financial rules are preserved. A PASS below specifies its scope; automated fixtures are not physical devices or Stripe test-mode transactions.

## Completion changes

- Isolate journey refresh, arrival reminder preparation, professional notification preparation, promotion preparation and push delivery. A failure in one no longer prevents unrelated preparation or push delivery. Email delivery remains independently attempted.
- Return HTTP 503 and record unsuccessful worker health for preparation/push failures, even if other channels succeeded. Logs contain fixed stage identifiers rather than origins, recipients, provider bodies or credentials. Existing durable outboxes, deduplication, leases, backoff and expiry recovery are reused.
- Add seven worker regression cases and a database activation case covering scheduler failure, atomic rollback, repeat execution, unchanged customer consent and honest operator audit identity.
- Add eleven webhook boundary cases using the actual Stripe SDK signature verifier with local fixture secrets: deposit/full amounts, asynchronous success, unpaid checkout, tampering, expired/wrong signatures, failed/expired Shop holds, refunds and retryable database failure. No Stripe provider calls or live financial operations occur in these tests.
- Prepare `scripts/activate-customer-journeys.sql` for the authorised administrative deployment connection. It enables only customer planning and opt-in departure reminders, requires a fresh scheduler heartbeat and active Owner, and records an operator audit without fabricating an Owner/MFA session. Customer preferences, Google routing, Smart Arrival GPS controls, sharing, financial rules and request limits are not changed.

## Feature evidence and remaining gates

| Feature | Status and evidence |
| --- | --- |
| Customer manual journey duration, transport mode and departure buffer | PASS in `tests/arrival-database.test.ts`, `tests/arrival-domain.test.ts` and `scripts/check-arrival.mjs`; activation verified separately in production |
| Automatic estimates, traffic-aware driving and transit timetables | Activation is tracked by the 19 October follow-up in `journey-routing-activation.md`. `GOOGLE_ROUTES_API_KEY` is the current name; `GOOGLE_MAPS_ROUTES_API_KEY` remains supported. Automated provider/parser, quota, encryption, consent and invalidation tests are separate from the required explicit live provider diagnostic and audited activation |
| Recommended departure time | PASS automated arrival/routing tests; manual duration remains explicitly labelled |
| Google Maps directions | PASS automatic directions-link tests and arrival browser checks; external app handoff on a physical phone is NOT VERIFIED |
| Departure reminders and preference opt-out | PASS isolated SQL tests for minute scheduler, consent, deduplication, cancellation/reschedule/location invalidation and stale stages |
| Server reminders while page is closed | PASS server architecture and scheduler checks; no open browser or background GPS is required to enqueue. Actual device receipt is NOT VERIFIED |
| PWA manifest, Home Screen icons, standalone metadata and safe areas | PASS `scripts/check-pwa.mjs`, live manifest/icon smoke checks and PWA tests |
| iPhone/WebKit, Android/Chromium and desktop; light/night mode | PASS browser automation. Physical installation, splash and OS suspension are NOT VERIFIED |
| Service worker registration, private offline fallback, update activation | PASS PWA browser checks and `tests/pwa-service-worker.test.ts`; private responses are not cached |
| Sessions and authentication/payment return URLs | PASS automated session, auth, return-url and browser suites; actual iOS/browser session boundaries are NOT VERIFIED |
| Notification permission, denial, registration and subscription recovery | PASS `tests/push-device-recovery.test.ts`, notification API/settings tests and browser checks |
| Booking, order, cancellation, message and business notification events | PASS database/API tests using the existing outboxes and role boundaries |
| Notification retries, expiry and failure isolation | PASS push classification/outbox tests plus `tests/notification-worker-isolation.test.ts` |
| Push click navigation and display/click receipts | PASS service-worker/API fixtures; physical lock-screen display and taps are NOT VERIFIED |
| Deposits, full payments, fee/commission snapshots and wallet accounting | PASS isolated database/API/UI suites, including `tests/booking-finance.test.ts` and `tests/professional-policies.test.ts` |
| Refunds, failed/expired payments, duplicate webhooks and forged amounts | PASS isolated payment/refund/database tests; no live financial operation is created |
| Stripe webhook signature verification | PASS `tests/payment-webhook-signatures.test.ts` using actual SDK cryptography, raw payloads and fixture secrets; real provider delivery remains a separate check |
| Stripe production webhook configuration | PASS read-only check: two enabled endpoints on the existing URL, expected checkout/refund/dispute/subscription and Connect/payout event families. Inspected historical checkout/refund events had zero pending webhooks |
| Real Stripe test-mode transactions | NOT VERIFIED: the connected Glohaus Stripe context exposes live mode only. No test-mode key/context is available. Do not use live credentials for this test |
| Customer, professional and Owner/Admin regressions | PASS status must be tied to the final commit's complete GitHub workflows; these include auth, messaging, uploads, policies, bookings, map, notifications, Owner tools and both themes |
| Native background GPS/geofencing | NOT VERIFIED / not implemented; remains separate future native development |

## No-code account requirements

1. Google Cloud: authorise a billing-enabled project with Routes API enabled and a server key restricted to Routes API. Put the key in Vercel `glohaus1` Production as sensitive `GOOGLE_ROUTES_API_KEY` (legacy `GOOGLE_MAPS_ROUTES_API_KEY` also works). Do not paste it into chat or use a `NEXT_PUBLIC_` name. The independent encryption key already exists. After deployment and a successful provider diagnostic, enable the existing routing control through Owner MFA or the explicitly authorised, audited deployment procedure. The app's existing 100/day and 3,000/month limits remain unchanged.
2. Stripe: authorise the existing Glohaus test environment/sandbox through the Stripe connection. Production stays in live mode. Automated provider transactions must use the isolated test context and isolated application database, with separate test webhook secrets. A test API key must never replace production payment credentials.
3. Physical devices: follow the checklist below. No code changes or terminal commands are required.

## Phone installation and receipt checks

### iPhone

1. Open `https://www.glohaus.shop/install` in Safari.
2. Share → Add to Home Screen → enable Open as Web App if offered → Add.
3. Open the new Home Screen icon and sign in. Use a compatible iOS/iPadOS version supporting Home Screen Web Push (16.4 or later).
4. Customer: open Account → Phone notification settings (`/account/notifications`). Professional: open Settings and business tools → Notifications (`/professional/settings/notifications`).
5. Press **Enable this device**, then allow notifications. Select the push categories you want and press **Send test** on this device's row.
6. Check the visible notification, tap it and confirm the correct GLOHAUS page opens. Repeat a test after closing the app and locking the phone. Allow a minute before another test. A queued/provider-accepted status alone is not a device pass.
7. If permission was denied, change the installed app's notification permission in iPhone Settings and reopen GLOHAUS. Focus settings may silence notifications.

### Android

1. Open GLOHAUS in a supported browser such as Chrome. Use **Install GLOHAUS** when offered or browser menu → Install app / Add to Home screen.
2. Launch the Home Screen icon, sign in and repeat the same Enable this device → allow → choose push alerts → Send test steps.
3. Verify a visible notification and tap navigation while the app is open, closed and the phone locked. Record device/OS/browser versions and any battery restrictions.

### Appointment departure reminder

Use an agreed genuine confirmed appointment with a professional-confirmed appointment pin. Open the customer's booking, acknowledge the current appointment instructions, choose transport, enter the journey duration, choose a buffer and opt into departure reminders. Check the displayed departure time and save. The server prepares reminders near 15 minutes, 5 minutes and departure, skipping stale stages. Verify the actual inbox/push and Owner communication record separately. Do not create production bookings or contact customers solely to manufacture evidence.

Optional one-off route calculation and scheduled rechecks require separate Google-processing consent after routing is configured. Installing the PWA does not make browser GPS work reliably while the app is closed.

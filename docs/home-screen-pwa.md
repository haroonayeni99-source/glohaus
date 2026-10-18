# GLOHAUS Home Screen app — implementation and release checks

This change extends the existing Next.js website. It creates no separate website, native app, App Store listing, login system, notification worker or payment integration. Production deployment and the database migration require Haroon’s approval. No production changes are included in preparing this branch.

## What already existed

- `src/app/manifest.ts`: GLOHAUS name, standalone display and root scope, but a professional-only `/professional` launch URL and black theme/background.
- `public/icons/glohaus-192.png` and `glohaus-512.png`: existing crown brand assets. They are retained unchanged.
- Root Apple web-app metadata and a 192px Apple icon reference.
- `public/sw.js`: the existing Web Push worker with private lock-screen copy, safe same-origin links and signed display/click receipts. There was no fetch caching or offline fallback, and registration happened through push enablement.
- Existing VAPID subscriptions, notification preferences, delivery worker, professional settings/tests and customer appointment-specific push registration/tests.
- Existing Supabase sessions, canonical `www.glohaus.shop` redirects, Stripe return handling, responsive dashboards and several bottom safe-area insets.

## What this change adds

The manifest launches `/` for both audiences, retains a stable `/` app ID and scope, uses the current CSS plum `#e95f96`, and includes a maskable icon. The new opaque 180px Apple icon and 512px maskable icon are proportionate derivatives of the existing crown asset; the original 192/512 icons are unchanged. No generated or replacement logo is used.

`/install` provides the five Safari steps (including Open as Web App where available), Android/desktop browser menu guidance, and the actual standard browser prompt only when the browser supplies `beforeinstallprompt`. A small mobile installation guide appears only at home, customer account and professional dashboard entry points. Dismissal suppresses it for 90 days on that browser. Standalone windows suppress the guide. Installation never requests notification or location permission. Installation support and session storage vary by browser; an already installed app cannot always be detected from an unrelated browser window.

The same root service worker registers without needing push consent. Its exact cache allowlist is offline help plus four app icons. It does not cache authenticated pages, APIs, JavaScript app shells, booking/payment status, uploaded media, map data or RSC requests. Document navigations use the network; only network failure produces a static, private/no-store 503 offline response. Real HTTP errors remain real errors. API failures remain failures. The offline help states that bookings, payments, messages, maps, uploads and journeys require a connection.

Updates wait while existing clients are open. A waiting update can be activated at a safe entry point after an explicit confirmation; only the window that requested the update reloads. Other windows are not automatically reloaded. The user is told to finish work across all GLOHAUS windows. Closing all old windows also permits the standard service-worker lifecycle to update. Only caches with the GLOHAUS static-cache prefix are cleaned up.

Standalone-only CSS adds top/side safe areas and prevents small input fonts from causing iPhone focus zoom; existing bottom navigation insets remain. The viewport allows zoom and uses `viewport-fit=cover`. Camera use by this origin is permitted by the Permissions Policy, while browser permission and existing upload validation remain required. Microphone policy is unchanged. Native file/photo pickers are reused.

## Customer and professional notifications

Professionals retain their existing settings, alert categories, essential emails, test action and delivery worker. Customers gain `/account/notifications` with the same device UI, optional booking/order/change/message/reminder push switches, explicit device enablement, test and disable actions. Their push settings do not alter transactional or marketing email choices. No general customer push category is opted in by default. Existing appointment-specific push consent is preserved for changes/reminders; a later explicit opt-out is respected.

Migration `20261018210732_customer_pwa_notifications.sql` adds narrowly scoped customer functions over the existing forced-RLS tables and extends the existing customer fan-out trigger. A professional’s real message creates one private customer inbox event without copying message contents. Push uses that existing inbox event and the existing worker; professional source events are unchanged. Endpoint ownership, allowlisted providers, a 10-device limit, active/restricted account checks and serialized one-test-per-minute limits are enforced in the database. Tests target one selected device. Customer functions cannot expose endpoint keys through settings or modify another account’s devices. No money, booking state or fee rules change.

Push permission is requested only by an Enable action. iPhone/iPad browser tabs explain the need to launch the installed Home Screen app before enabling push. Supported iOS/iPadOS 16.4+ Home Screen apps use standard Web Push. Denied/unsupported states preserve email and in-app access. Registration, queued tests, provider acceptance, device display, clicks and explicit appointment-instruction acknowledgement remain distinct.

## Files changed

| Area | Files |
| --- | --- |
| App metadata and platform headers | `src/app/manifest.ts`, `src/app/layout.tsx`, `next.config.ts` |
| Installation and runtime | `src/lib/pwa-client.ts`, `src/components/pwa-shell.tsx`, `src/components/pwa.css`, `src/app/install/page.tsx` |
| Offline and icons | `public/sw.js`, `public/offline.html`, `public/icons/apple-touch-icon.png`, `public/icons/glohaus-maskable-512.png` |
| Entry links and existing push UI | `src/components/site-footer.tsx`, `src/app/account/page.tsx`, `src/app/notifications/page.tsx`, `src/components/customer-appointment-push.tsx`, `src/components/professional-notification-settings.tsx` |
| Customer notification API/page | `src/app/account/notifications/page.tsx`, `src/app/api/v1/account/notification-settings/route.ts`, `src/app/api/v1/account/push-subscriptions/route.ts` |
| Existing notification integration | `src/modules/notifications/repository.ts`, `src/modules/notifications/push-worker.ts`, `db/migrations/20261018210732_customer_pwa_notifications.sql` |
| Verification/review | `tests/customer-pwa-notifications.test.ts`, `tests/customer-pwa-api.test.ts`, `tests/pwa-service-worker.test.ts`, `tests/pwa-install-ui.test.ts`, `scripts/check-pwa.mjs`, `.github/workflows/ci.yml`, `vercel.json`, this report |

## Automated evidence

The new tests exercise real migrations and roles for customer settings/device isolation, explicit consent, message fan-out, private copy, selected-device tests, throttling and preference preservation. API tests cover role boundaries, CSRF, strict input, outbound endpoint restrictions and private responses. Worker tests execute the actual worker to prove the cache allowlist, live-page pass-through, API/RSC/payment isolation, offline errors, cache cleanup and explicit update activation. Component tests cover iPhone guidance, persistent dismissal, standalone suppression, explicit single-use Android prompts and iOS push capability handling.

`node scripts/check-pwa.mjs` uses the production Next.js build, Chromium desktop/Android emulation and WebKit iPhone emulation in both themes. It checks manifest parsing and Chromium installability errors, actual icon dimensions, viewport metadata, one root service worker, cookie persistence across reload, offline private navigation, API failure, cache contents, reconnection, overflow and real waiting-worker update/cancel/reload behavior. It temporarily changes only the local worker to test an upgrade and restores it in `finally`. Screenshots/results are CI artifacts. Emulation and an opaque cookie probe do not prove physical Home Screen session behavior or a real Supabase/Stripe round-trip.

Final automated results and the review commit are recorded in the pull request. No physical iPhone, Android, actual payment or new email/push receipt is claimed by this report.

The pinned Playwright 1.63 WebKit has a [confirmed offline-emulation defect](https://github.com/microsoft/playwright/issues/42775) that blocks service-worker responses before dispatch. The WebKit fallback check therefore stops and restarts the actual isolated local origin; it still requires the worker-served 503 response, correct static help, failed API access, exact safe cache contents and successful reconnection. Chromium additionally uses full browser offline emulation. This is a server-unavailability control, distinct from a physical device losing connectivity; no fallback assertions are skipped.

## Approval and release sequence

1. Review the PR, complete checks and migration. Approve production deployment explicitly.
2. Apply the additive customer notification migration through the existing reviewed migration workflow; verify forced RLS and function privileges. No new service credentials are required for PWA installation. Reuse existing VAPID keys, CRON_SECRET, Resend and Supabase configuration; do not rotate keys for this change.
3. Merge/deploy the approved commit to the existing Vercel project `glohaus1` and canonical production domain. The feature branch has Vercel deployment disabled; preparing this PR does not publish a preview or production release.
4. Verify live manifest/icons/worker headers, signed-out API boundaries and scheduler/worker health. New customer settings require the migration before use.
5. Complete the physical-device checklist below with consenting test accounts and devices, then evaluate any wider rollout. Never treat queued or provider-accepted messages as physical receipt evidence.

## Physical-device checklist — outstanding

| Device/flow | Required evidence |
| --- | --- |
| Real iPhone Safari | Share → Add to Home Screen → Open as Web App where offered → Add; correct crown icon and standalone launch of `/` |
| Real Android supported browser | Native Install/Add to Home Screen, correct icon and standalone launch |
| Customer/professional sessions | Sign in within the installed app, close/reopen, switch roles where authorized, sign out, confirm private pages are protected; repeat Safari/external-browser transitions |
| Checkout | Consented test booking/payment, external Stripe redirect/return, correct latest booking status, no duplicate payment; check Shop checkout too |
| Account access | Customer/professional dashboards, Owner/Admin MFA, messages, notifications and normal back navigation |
| Maps and journeys | Explore, external Google Maps, Smart Arrival permission/status/manual arrival and Journey Planner where enabled |
| Media | Actual camera/photo-library selection and upload in customer profile, professional profile/portfolio and Discover/Story; cancellation and denial states |
| Phone push | Installed supported app, explicit enable, category choice, selected-device test, actual display and click, Owner/Admin receipt evidence, denial and disable behavior |
| Offline/update | Offline fallback with no private/status data; reconnection; update waiting during unsaved work; confirmed reload after saving |
| Both themes | Safe areas, keyboard, scrolling, readable text, touch controls and orientation |

## Outstanding limits and configuration

Home Screen installation does not enable reliable GPS while the app/browser is closed. Smart Arrival retains manual fallback. Native background geofencing remains separate future work. Push delivery depends on browser/OS support, user permission, device settings, connectivity and push services; it is not guaranteed at an exact time.

Automatic journey routing still needs `GOOGLE_MAPS_ROUTES_API_KEY`, Google provider/billing/quotas setup and Owner activation as documented in `docs/journey-routing-activation.md`. The encryption secret already exists in production. Smart Arrival, planner, departure reminders and routing are not enabled by this PWA change. Provider transit disruption coverage is not guaranteed. Actual email receipts and physical phone receipts remain rollout verification tasks.

References: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), [Apple Home Screen Web Push](https://webkit.org/blog/13878/), [Safari 26 Open as Web App behavior](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [Chrome installation criteria](https://developer.chrome.com/blog/update-install-criteria).

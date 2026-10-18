# Smart Arrival and customer journeys

Implementation branch: `feature/smart-arrival-journeys`. This document distinguishes implemented work from release prerequisites. Production has not been changed by this branch.

## Approved role split

Professionals confirm the agreed appointment pin, supply entrance instructions, offer optional Smart Arrival, see customer-reported delays and voluntarily shared journeys, confirm physical attendance and record an appointment start. They cannot enable customer consent, plan a customer's private journey or read a customer's origin.

Customers have their own journey planner, independent Smart Arrival permission, optional live sharing, manual check-in, an optional ETA with “I'm running late”, and travel reminders. The professional's dashboard has no journey planner. Browser geolocation is activated by an explicit customer action. Refusing permission does not cancel, penalise or prevent attendance.

Owner/Admin has Arrival & communications in the existing console. It shows instruction versions, browser-reported display events, explicit acknowledgement, original accepted policy version/acknowledgement for a selected booking, arrival disputes, reviewed corrections and delivery history. The Owner controls feature switches, safe radius defaults and the default buffer. Existing Owner/Admin MFA remains required. No live customer location, starting address or private saved journey plan is returned to this console.

## Implemented

- Additive migration `20261018161105_smart_arrival_journeys.sql`: four private, forced-RLS tables; existing live-location sessions gain an anti-replay nonce. Public/anonymous/authenticated roles have no direct access to the new private records; app users call authenticated, participant-checked routines owned by restricted NOLOGIN/NOBYPASSRLS operators.
- Appointment-specific location version and radius snapshot. Professionals explicitly confirm the physical location using the existing street map or coordinate fields. Changing instructions/location requires the current version, resets customer acknowledgement/Smart Arrival consent, revokes sharing and invalidates the old journey plan. Recorded arrivals cannot be overwritten. The location cannot be moved after the appointment starts.
- Smart Arrival uses two accurate readings received at least five seconds apart, no more than 90 seconds apart. Device-reported accuracy must be at most 50m and the accuracy circle must fit inside the snapshotted radius. The first reliable server receipt is retained; device observation and receipt timestamps are separate. Replay/future readings and rapid requests are rejected. Raw detection coordinates are not stored in an arrival trail.
- Manual check-in, detected proximity, confirmed attendance and appointment started have separate immutable events/timestamps. None completes a booking, charges a penalty, changes a deposit/commission or triggers a refund. Existing booking policies remain authoritative, including their snapshotted grace period. GPS can be spoofed and is not conclusive evidence of attendance.
- Customer plans save only mode, duration, buffer and departure time; a private origin stays in browser memory and is passed to Google Maps only when the customer opens directions. An origin is never accepted by the plan API. A customer's saved estimate is used honestly; automatic traffic monitoring is not claimed.
- Existing shared-location interface is retained and tightened. Explicit start gets a fresh server nonce; updates require that nonce and cannot reactivate a stopped session. Cancellation, completion, reschedule, location changes and feature disable revoke sharing. Stale/expired positions are hidden at the database and API boundaries; the professional's view also expires cached positions. The professional can view the current voluntarily shared position on the existing map. No customer movement history is created.
- Existing inbox, transactional email outbox, verified Resend webhook receipts and push queues are reused. Email accepted by Resend is “sent”; verified provider receipt is “delivered”; inbox read actions and explicit acknowledgement are distinct. No status claims the customer read a push/email. Owner/Admin can resend an unsuccessful arrival instruction notice with a reason; stale departure reminders cannot be manually resent.
- Optional departure reminders are prepared on the server, deduplicated per plan revision and stage (15min, 5min, departure), and stale stages are skipped. Changing/cancelling/rescheduling a booking invalidates old notices before email/push claim. Registered customer devices use the existing service worker; safe departure headings contain no origin, address or identifiable treatment.
- Notifications cron changes from hourly to once per minute. The signed cron endpoint records a heartbeat. Enabling reminders requires a recent heartbeat; claims stop if the heartbeat becomes stale. Minute timing still depends on scheduler execution and provider/device delivery; it is not an exact real-time guarantee.
- Arrival disputes append a request, and an authorised Admin appends a reasoned correction without destroying the original evidence or changing money.

## Reused

Bookings and their lifecycle, Supabase identity and runtime SQL role boundary, professional public pins and GeographicMap, immutable booking-policy snapshots, existing notifications and Resend provider-event processing, push subscriptions/service worker, scheduled notification worker, protected Owner/Admin console and audit log. No new booking platform, map renderer or payment integration was added.

## Privacy assessment and retention

This is an engineering assessment and a release checklist; it is not a claim of completed legal approval. Before enabling the new location features, the data controller must approve the updated privacy notice, lawful basis and retention schedule and complete any required DPIA. ICO guidance on when a DPIA is required includes tracking location/behaviour and evaluation of the combined risk factors: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/ .

Risk controls implemented: separate optional consent, per-booking ownership, no Admin live-tracking access, immediate access revocation, an anti-replay session nonce, bounded reading frequency/accuracy, minimal operational records and no automatic financial decision based on GPS. A browser-origin display event is expressly labelled telemetry and not proof of understanding.

Only the latest shared position is stored, with a 90-second freshness boundary. Coordinates are cleared on stop/revocation, expiry or stale cleanup. The worker removes saved plans one day after the appointment ends. Configured private entrance/pin details are redacted after 30 days. Arrival event details are removed after 180 days except while an arrival dispute remains unresolved; a later correction resolves the hold for that dispute. Existing transactional booking/payment-policy retention remains unchanged. Support review must handle access/erasure requests and any justified legal hold. Location cleanup runs even if all browser tabs are closed, through the existing worker.

## External services and costs

No new mapping API key, paid mapping subscription or third-party tracking app is enabled. Existing OSM map tiles retain the map's existing consent/privacy behaviour. Google Maps directions are an explicit external navigation link; its current routing estimate must be copied into the planner. No routing-provider billing is incurred by a GLOHAUS backend API call in this implementation.

Automatic in-page route durations, live traffic/public-transport recalculation and approaching ETA alerts are not implemented. These need a chosen and budgeted routing provider plus verification. The supported fallback is directions plus an explicitly entered journey duration.

Vercel's current cron documentation says Pro/Enterprise allow one-minute schedules while Hobby permits daily schedules only: https://vercel.com/docs/cron-jobs/usage-and-pricing . No hosting-plan change is made here. The existing hourly schedule already requires a compatible plan; verify the actual production plan. Moving the existing worker to every minute increases invocations (about 43,200/month), function/database activity and potentially existing provider usage. Review usage after rollout. No new environment variables are added: existing `CRON_SECRET`, restricted worker database connection, Resend configuration and optional VAPID configuration are reused.

## Release and verification

New Smart Arrival, customer planner and departure-reminder flags default OFF. Existing optional live sharing remains available with tighter privacy controls; its Owner switch can disable it. Branch previews are disabled in `vercel.json`.

Run lint, TypeScript, the complete migration/unit suite, production build, existing browser regressions and the new `smart-arrival` CI job. The new browser fixture uses real components with fictional, intercepted API responses; the separate database suite exercises real migrations/roles and authenticated functions. This is not evidence of live-device background geofencing or actual email/push arrival.

Release sequence: verify all checks; review privacy/retention and any needed wording; apply the additive migration using the existing checksum-tracked operator workflow; deploy through the existing production workflow; confirm signed one-minute cron heartbeats, email/push delivery receipts and real iPhone/Android foreground flows with consented test accounts; then enable a controlled rollout. No mock production accounts, paid payments, notification sends or production SQL changes are performed by local tests.

Browser limitations: HTTPS and explicit location permission are required. Tracking pauses on hidden pages and must be resumed deliberately. Browser closure/suspension can prevent automatic detection, and weak GPS requires manual check-in. Push needs browser support, permission, connectivity and secure VAPID configuration; iPhone support may require an installed Home Screen app. Native iOS/Android background geofencing, platform permission strings, lifecycle/battery handling and native push are future work; keep the same authenticated booking-scoped events/API when adding them.

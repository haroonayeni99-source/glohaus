# Professional notifications — implementation and release review

Status: implemented on an isolated feature branch; not deployed. Production migration and VAPID configuration have not been applied. No real email, push message, purchase, booking or account mutation was used for testing.

## Existing systems retained

- Private `beauty.in_app_notifications` inbox and recipient RLS; mark-read APIs and UI.
- Booking email outbox, customer/professional confirmation and cancellation messages, policy/reschedule events, customer reminders and review requests.
- Seller-scoped paid product orders, in-app order events and transactional product email outbox.
- Resend sender, suppression list, signed delivery-event webhook, provider IDs, stable idempotency keys, retry leases and existing Owner email health.
- Marketing consent/campaign queue and professional engagement emails.
- Existing cron worker, authentication, booking calendar, Stripe, financial ledger, fees, deposits, refunds and payout rules.

## Added

- `/professional/settings/notifications`: separate email/push choices for bookings, marketplace orders, cancellations/reschedules, customer messages, appointment reminders, reviews and promotions. Essential transaction email cannot be disabled in either API validation or database constraints. Security/payout/verification emails remain on their existing paths.
- Persistent preferences and up to ten active device subscriptions per professional, protected by a non-login notification operator and RLS. Browser endpoints/keys cannot be read through application tables or settings responses; devices are returned as ID/label/status only. Enable, revoke and explicitly requested test actions check ownership. Failed re-registration preserves an existing working browser subscription; an unsaved new subscription is cleaned up without masking the original save error.
- Existing inbox extended with customer-message, completed-booking review, booking/Shop dispute, refund-action and order-cancellation events. Existing scheduled-maintenance cleanup recognizes the extended email kinds. Booking policy events use their existing immutable event IDs to prevent duplicate inbox messages. No private message/review body is copied into email or push alerts.
- Upcoming-appointment professional reminders use the existing booking calendar. A rescheduled appointment gets a distinct reminder; superseded professional email reminders and stale reminder pushes are suppressed.
- Live notification stream and unread badge, shared between professional navigation and inbox. Snapshots refresh approximately every five seconds through the existing authenticated, recipient-scoped database connection, without holding a DB connection between snapshots. Streams stop when the page unmounts or sign-in identity changes.
- Existing booking email outbox reused for new professional alert kinds; product email outbox remains seller-specific. Device push uses its own transport delivery records rather than a second notification/event catalogue.
- Web Push through `web-push`, PWA manifest/icons and `/sw.js`. No authenticated page/API caching or offline purchase flow. Subscription registration accepts recognized browser push provider HTTPS endpoints only, to prevent arbitrary outbound server requests.
- Generic lock-screen copy with a protected local destination and stable notification tag. No customer name, message, service, payment amount, health information or address appears on the lock screen.
- Durable per-device leases, uniqueness, bounded batches, retry backoff, failure statuses, 404/410 device expiry, delivery-time opt-out checks and remote revocation.
- Transactional server routes schedule delivery using Next.js `after()` after their database commit; the existing hourly cron remains the recovery mechanism. Scheduling/provider failures cannot turn an already successful business operation into a failed response. No paid SMS introduced.
- Aggregate Owner/Admin push diagnostics alongside existing email health. No subscription credentials or private message content are shown.

## Verification

- `pnpm check`: lint, TypeScript, 1,041 tests across 115 files, production build.
- Device recovery regression tests reproduce the previous accidental unsubscription on a failed enable request, then verify existing-device preservation, new-device cleanup, cleanup failure reporting and successful registration followed by a failed settings reload. These use isolated browser API stubs and do not establish actual push reception.
- New coverage includes separate customer/professional identities in an isolated migrated database; unpaid checkout exclusion; one inbox/push event after replay; shared-checkout seller isolation; message and completed-booking review events; Shop cancellation/refund/dispute alerts; independent persistent email/push choices; mandatory-email rejection; cross-origin/payload/role checks; private VAPID handling; device ownership/SSRF/expiry/retry/revocation; live unread updates and mark-read; anonymous function grants and RLS.
- Existing payment, checkout, refunds, disputes, financial ledger, professional policies, authentication and account visibility regressions also pass.
- Live read-only schema preflight confirms all source tables, constraint names and function patch anchors match. Existing production counts remain 11 bookings, 11 payments and 8 ledger entries. No production DDL or data writes were performed.
- Graphical interface coverage is provided by `scripts/check-professional-notifications.mjs` in CI: 320/390/820/1440px, light/night themes, locked mandatory email, independent preference persistence after reload, device revocation, mark-read, mobile bell visibility and overflow. A failed-save case checks recovery. Screenshots/results are saved as the `professional-notifications-checks` artifact. These fictional local interface checks do not establish actual phone push reception. The cloud browser cannot reach the workspace server (`ERR_CONNECTION_REFUSED`); the repository CI supplies the isolated browser environment.
- Actual Resend inbox delivery and Android/desktop/iPhone push reception have not been tested. Provider transport tests use a stub; no delivery claim is made from provider acceptance alone.

## Configuration and controlled rollout after approval

1. Review the feature branch and passing checks. Branch preview deployments are explicitly disabled in `vercel.json`; do not merge to production until approved.
2. Generate a VAPID key pair privately using the pinned `web-push` package. Set `VAPID_PUBLIC_KEY`, sensitive `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (`mailto:` address controlled by GLOHAUS) as server environment variables. Never commit private keys, paste them into chat, or use `NEXT_PUBLIC_` for the private key. Keep the same pair for existing subscriptions; rotating keys requires re-enabling devices.
3. Apply only `20261015234554_professional_notification_delivery.sql` using the established checksum migration ledger and a bounded transaction. Do not run the full historical migration backlog against production. This is an additive migration and retains existing inbox/outbox/history rows.
4. Deploy the reviewed production source. Existing Resend API/webhook and cron credentials were confirmed present through metadata only; VAPID variables were absent at review.
5. Use specifically designated disposable customer/professional accounts in a controlled test environment. Complete a paid booking and a multiple-seller product purchase; verify each actual inbox, email delivery webhook, and permitted device. Exercise cancellation, approved rescheduling, refund/dispute, optional opt-outs, mandatory notices, duplicate webhook delivery, device revocation and reconnect. Keep real financial test activity subject to the existing payment testing policy.
6. On iPhone/iPad, install using Safari → Share → Add to Home Screen, then enable notifications from that installed app. Android/desktop require a compatible browser and notification permission. Mobile emulation does not establish actual phone push reception.

The existing hourly cron is unchanged. Immediate post-response dispatch handles normal event latency; reminders/recovery can be delayed by up to the hourly cadence. A more frequent scheduler can be considered separately if required and supported by the hosting plan. Push provider acceptance does not guarantee device display; connectivity, operating-system policy and user permission still apply. Stable tags suppress repeat visible alerts after ambiguous transport retries, but Web Push provides no exactly-once device-receipt guarantee.

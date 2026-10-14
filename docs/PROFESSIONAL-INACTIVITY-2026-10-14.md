# Professional inactivity monitoring

First alert: **14 days**, selected by the Owner on 14 October 2026. This source is under review; the migration is **not applied** and the feature is **not live**. Feature-branch Vercel deployments are disabled.

## Behaviour

- Authenticated, authorised professional website requests refresh observed activity, throttled to one write per hour. Confirmed/completed booking state changes also refresh it. A lack of bookings by itself never classifies a professional as inactive.
- Existing professionals get a fresh baseline when the migration is applied. Unknown historical activity is labelled as a monitoring baseline, never as a real sign-in. New profiles enter monitoring on authenticated use or the existing hourly maintenance job.
- The hourly maintenance job emits one 14-, 30- and 60-day stage per inactivity episode. A return resets the episode and invalidates queued stale email. A late first run emits only the current stage, rather than three notices at once. Each run processes up to 100 profiles; overlapping runs and repeated runs do not duplicate a stage.
- Active draft profiles receive setup nudges; self-hidden, suspended, deleted, restricted and discovery-hidden profiles are excluded from automated inactivity outreach. No account is deleted, suspended or automatically hidden.
- The professional and active Owner receive private in-app notifications. The Owner also gets operational email. Professional re-engagement and offer emails require their existing growth/promotion preferences and include the existing unsubscribe link. A published profile's 60-day visibility warning is operational; draft setup nudges remain optional marketing. Suppressions, roles, preferences and stale activity are rechecked at email claim time.
- Email queue claims are leased, retried at most five times within 23 hours and use the stable outbox ID for Resend idempotency. Accepted is distinguished from delivered; this feature does not add provider-delivery webhook reporting for the new queue. Pending, accepted, cancelled/opted-out and exhausted counts appear in the activity panel.

## Owner/Admin and professional controls

`/admin` → **Inactive Professionals**. Owner and MFA-verified Admin can search the paginated review queue. Only the Owner can approve these actions; the database repeats permission and current-state checks and writes the established audit log:

- **Offer seven-day boost**: available after 30 days of inactivity, at most once per inactivity episode. Offer valid for 14 days. The professional reviews their profile/availability and affirmatively accepts in their dashboard. Acceptance requires an active account, published/unrestricted profile and active service. A single seven-day boost starts then; acceptance cannot repeatedly extend it. Fees, deposits and commission are untouched.
- **Hide from discovery**: requires at least 60 days without activity, a persisted warning at least seven days old, a currently published profile and explicit Owner confirmation/reason. A return invalidates the decision. It excludes the professional from the Home/Explore professional directory and nearby-map results. Account access, direct profile links, existing bookings, funds, products, existing posts and following relationships are preserved.
- **Restore discovery visibility**: explicit Owner confirmation/reason. Publication/account/trust restrictions continue to apply. Signing in or republishing cannot silently override an Owner discovery restriction. The professional sees the hidden status and a support link.

Active boosts add one point to the internal discovery confidence score after distance relevance. Displayed review ratings are unchanged. Featured cards are labelled as a visibility boost. Cursor scores support the additional point. Expired boosts and profiles without an active public service or with restricted trust receive no boost. Other profiles keep the previous ordering.

## Security and integration

New tables have forced RLS, no direct application/anonymous access, restricted operator policies and indexed queue/history paths. Internal functions revoke PUBLIC/anon/authenticated execution. The runtime can call only authenticated self-service and MFA/Owner-guarded routines. The public projection contains professional ID, hidden flag and active-boost flag; monitoring dates, emails and reasons are private.

The existing page/API authorisation, maintenance worker, notification worker, marketing preferences, suppression list and audit log are reused. Optional visit telemetry uses a savepoint so a missing migration cannot abort an otherwise valid sign-in. New dashboard reads fail independently of existing sections. The directory and cron code require the additive migration before release; do not deploy source without it.

## Validation and release

Focused database/API and interface checks cover thresholds, duplicate-stage prevention, stale decisions, missing/expired offers, consent, suppression, retry windows, Owner/Admin/MFA/origin checks, hiding/restoring, real ordering and boost expiry, unchanged displayed ratings and booking amounts. Existing likes/saves, booking/payment and account regression checks remain required.

The local full suite passed **906 tests in 100 files**. ESLint, TypeScript and the webpack production build passed. Local Chromium installation returned an invalid archive; GitHub Actions runs the 24 mobile/desktop, light/night, Owner/Admin/professional interface cases with fictional data and intercepted mutations. No production notification, offer, visibility change, financial transaction or database migration has been made during development.

For release, inspect the exact reviewed commit and CI results, apply only `db/migrations/20261014203519_professional_inactivity.sql`, check new grants/RLS and advisors, then deploy the matching source through the existing project. Do not run the bulk migration runner against the known legacy migration-history drift. The migration is additive and old source can coexist while all new state begins neutral. The first eligible alerts occur after a fresh 14-day baseline. Confirm real runtime visit tracking, scheduled-job health, queue status and authenticated dashboards after deployment. Real external email delivery and true multi-session concurrency are not proven by isolated PGlite tests.

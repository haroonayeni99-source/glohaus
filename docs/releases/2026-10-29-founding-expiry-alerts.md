# Founding expiry alerts

Owner-only in-app notices are queued by the existing hourly maintenance job:

- One heads-up when a Founding trial or protected legacy extension is within 24 hours of ending.
- One ended notice after its end, with a seven-day catch-up window for missed jobs.
- Unique rule/Owner/stage records and an advisory lock prevent duplicate notices on retries or overlapping cron runs.
- Dates use London time. Notices distinguish a trial from a legacy extension and explicitly preserve existing bookings and any protected additional benefit.
- Only the active, unrestricted, non-deleted Owner receives notices. Admin, customer and professional accounts cannot run the monitor, inspect its private audit records or read the Owner's inbox.
- The job does not alter commission rules, payments, wallet balances, benefits or rewards. There are no new email sends or external-account requirements in this release.

Apply `db/migrations/20261029235218_founding_expiry_alerts.sql` before deploying the maintenance route. The new function is callable only by the existing payment worker; its table has forced RLS and no browser access.

Validation covers the heads-up/ended stages, repeated runs, early/stale offers, recent catch-up, legacy wording, account restrictions, inbox isolation, cron authorization and retry behavior. Production rollout and verification remain gated on CI.

Verified again on 30 October: 62 tests passed across the expiry monitor, cron authorization, notification inbox isolation, commission controls and notification copy; TypeScript and targeted ESLint passed. No production migration or notice was issued. Production release requires the verified restorable backup and staging checks requested by the Owner. The referral branch changes the same maintenance route: integration must retain both monitor calls and their response fields.

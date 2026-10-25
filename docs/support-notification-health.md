# Support alert health follow-up

The existing notification worker previously logged support-send failures but could still record a successful heartbeat. Pending retries and exhausted support alerts are now recorded as aggregate counts in worker heartbeat details. The existing Platform Health notification failure counter and latest failure time reflect these problems, and the notification run reports degraded health while they remain. Other notification queues continue processing.

Counts distinguish processed alerts, provider acceptance, queued alerts, retries and exhausted attempts. Acceptance is not labelled delivery. No customer names, email addresses, case contents or evidence enter these health records. The existing bounded claims, retry schedule, idempotency keys and private queue permissions remain in use. No new scheduler or dashboard is introduced.

Isolated mocked-provider regressions cover successful acceptance, a failed support send with successful unrelated email, exhausted alerts with no claimable job, recovery and unavailable queue access. Payout-preparation failure isolation is also covered, and the existing payout notification kind is included in the TypeScript inbox type.

Operational checks before this follow-up confirmed healthy production maintenance/notification heartbeats, configured push, no preparation failures and no pending support alerts. Resend reports the sending domain verified, receiving disabled there, and no email sends in the inspected 24–25 October period. Those checks do not prove fresh email delivery, inbound mailbox forwarding or physical-device push delivery.

Financial settings, Stripe, wallets, payout processing, earned benefits and founding enrolment state are preserved. Proposed customer-source rates remain drafts. No schema migration is required. Rollback target: production commit `9f378e6bf997a70411f6e702144f7cef3d4e75df`, deployment `dpl_42FgNy7QzCV5WQPvutGZZaZTaNtM`.

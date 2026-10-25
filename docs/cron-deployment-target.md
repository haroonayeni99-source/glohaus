# Production deployment and cron schedules

Verified on 25 October 2026 through Vercel project/domain and Git deployment context:

- Production is `glohaus1` (`prj_dHz5OLhAjygs8hOKi99cgtGScgba`) on the Pro team `haroon-glohaus` (`team_bt39lAKNGwFdn1g6Lynl2MrT`). Both `www.glohaus.shop` and `glohaus.shop` point here. This project is linked to `haroonayeni99-source/glohaus`.
- The older `glohaus-app` (`prj_IwqbTRAA8RF3yZqiAntGtrb3foNS`) belongs to the Hobby team `glo-haus` (`team_xulBQjtk4yTw4D6Vqlbw8Zja`). That team currently has no linked Git projects. Its earlier failed deployments do not describe the production deployment status.

Hobby supports cron execution only once per day. The existing hourly maintenance and every-minute notifications schedules require Pro. Keep both schedules in `vercel.json`; reducing them would delay existing background work. Do not reconnect the repository to the old Hobby project or disable main-branch deployment globally to suppress its historical error.

The approved desktop MUA shortcut, linking to `/explore?category=Makeup`, first reached production in commit `f56261876577a17b11e2abaaa683bcda6001abea`, deployment `dpl_H3jeKPhi88RsJUZd4VrQwH3NAQcv`. The regression script now checks MUA instead of the removed Waxing thumbnail while retaining both themes and mobile layout checks.

Before deployment, confirm the team, project, source commit and domain assignments. Require relevant CI checks and a READY production deployment. For rollback, select the previous known-good deployment within `glohaus1`; do not move domains to the Hobby project. No scheduler, payment, pricing or database changes are needed for this release.

References: https://vercel.com/docs/cron-jobs/usage-and-pricing and https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Worker audit

No scheduler or application changes were required. The existing production plan supports both schedules; Vercel limits Hobby to personal, non-commercial use (https://vercel.com/docs/plans/hobby). Moving this commercial marketplace to Hobby is not the deployment fix. No plan upgrade or new paid scheduler was purchased.

| Execution | Existing responsibilities | Cadence decision |
| --- | --- | --- |
| Event-driven | Signed Stripe webhook processing; booking/policy/message/support changes queue notifications and use post-response delivery; incoming support email queues forwarding. | Retain immediate processing with durable outbox recovery. |
| Every minute | Scheduler heartbeat, journey route refresh, departure/arrival reminders, payout status notices, professional/customer emails and push, consented marketing and support alert/forwarding retries. | Retain; daily execution would miss short reminder windows and delay recovery. |
| Hourly | Expire unpaid holds and shop reservations; release eligible ledger balances under existing dispute/payout policies; appointment/shipping reminders; clear stale claims; reconcile settled provider fees; professional inactivity monitoring; retention cleanup. | Retain; making the combined job daily would delay releases and expiry and can miss the 23–24 hour reminder window. |
| Daily candidates only | Retention pruning, old preparation/photo cleanup and day-scale inactivity checks could be separated in a future scheduler refactor. | They remain hourly inside the working maintenance job; no new daily job was introduced. |

Founding and commission promotions use start/end timestamps when resolving applicable terms, so expiry does not depend on an hourly job changing commission percentages. Payment/dispute webhooks and request-time authorization remain responsible for immediate financial and safety decisions; neither cron is a standalone fraud adjudication process.

Both endpoints require a nonempty `CRON_SECRET` and a constant-time Bearer comparison. Database role restrictions, row locks/leases, unique event references, ledger idempotency and Resend idempotency keys protect concurrent/repeated work. Delivery retries remain bounded and respect suppression/preferences; an accepted push is not proof of physical-device display.

Read-only production observation at 19:46 UTC on 25 October 2026: maintenance last succeeded at 19:00:31 UTC (one success in the previous hour); notifications last succeeded at 19:46:20 UTC (60 successes in the previous hour); neither had a recorded failure in 24 hours. Latest notification preparations reported no failures and push was configured. Booking, shop and marketing email queues had zero pending/exhausted jobs. Support forwarding had no queued/retry/processing jobs; push had no pending jobs and one expired subscription. No matching production error/fatal runtime logs were returned for the preceding hour. These are point-in-time observations, not proof of all future deliveries.

Validation includes isolated notification/reminder tests and extracted authorization guard checks; no authorized production worker was manually invoked. The Vercel fetch connector could not complete a direct unauthenticated endpoint probe because its deployment share-link authentication failed; this is not represented as an application-level 401 test. Physical iPhone/Android installation and push delivery still need real-device confirmation.

The PWA regression had an unbounded readiness wait following rapid theme reloads. The test now waits for an active controlling worker before reloads and uses bounded polling at subsequent checkpoints, preserving every installation/offline/update assertion and all application code.

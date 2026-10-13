# Commission Control Centre — staged for Owner review

This change is **not deployed**. The additive migration is **not applied to production**, the Centre ships disabled, and the feature branch explicitly disables Vercel deployments. No production rate, payment, payout, refund, rule or email was changed by this work.

## Behaviour

Owner/Admin keeps its existing `professional-commission` section and navigation. The Centre schedules platform or individual service rates, selects eligibility, reviews each mutation in a native modal, and records the verified Owner, timestamp, reason, previous state and new state. Only the Owner can mutate these rules; ordinary admin/staff/customer/professional access is denied. There is no new delegated financial role.

Standard live rates were read from production: unverified trial 10%; verified Starter 8%, Pro 6%, Premium 4%. Existing legacy individual agreements continue to apply. The production £1 default booking fee, verified 15%–40% deposit rules, unverified full-prepayment/trial limits, 4% instant withdrawal, free standard withdrawal, delays, refunds and dispute protections are retained. Shop commission is outside this service-commission control.

Priority is founding trial/reward, new individual agreement, legacy individual agreement, platform promotion, standard rule. The latest start, creation timestamp and rule UUID break ties within a priority. Windows are half-open: start inclusive, end exclusive. Every new scheduled rule/enrolment starts at least 24 hours after it is confirmed. Payable increases also require that professional's notice to be at least 24 hours old. New professionals receive current/upcoming global terms too.

Rate revisions create a new immutable rule. A non-founding rule can be ended early prospectively after 24 hours' notice. A founding contractual reward cannot be cancelled. Emergency pause blocks new rule creation and enrolments while preserving already scheduled terms and allowing an earned founding reward to be granted. Once activated, the Centre cannot be globally switched off to invalidate contracts; use the emergency pause.

## Founding programme

An Owner-confirmed enrolment grants 14 days at 0% GLOHAUS service commission. The professional submits three feedback answers from day 10, covering experience, improvements and willingness to use GLOHAUS again. Positive and critical responses qualify equally.

For this implementation, participation evidence is at least one paid booking or a published, visible post during the trial. The Owner reviews the feedback and confirms qualification. The earned reward lasts a full 30 days from the trial end, or the qualification time if reviewed later; a late review does not consume or backdate the promised 30 days. Each professional can receive each phase only once. Payment-processing/customer fees and verification limits remain separate from 0% commission.

Professional notices appear in the existing private notification inbox and `/professional/commission`, with transaction emails sent through the existing retry/idempotency worker after release. No notice email was sent during this work.

## Financial records

`booking_commission_terms` and `payment_commission_terms` are private one-to-one booking/payment records. They store applied basis points, commission pence, rule UUID/reference and pricing version; bookings additionally store the standard comparison rate, waived amount, agreed timestamp and customer-fee snapshot. Keeping them separate prevents the existing customer booking/payment SELECT permissions from exposing commission.

New reservations freeze their terms atomically. Financial quotes use the saved terms, not today's promotion. First quotes for a legacy pending reservation without agreed terms freeze its terms then. Existing quotes are copied exactly to legacy snapshots; charges with no recoverable legacy quote remain explicitly counted as a reporting gap rather than being guessed or repriced. Concurrent first quotes serialize on the booking advisory lock.

New quotes must collect full service commission from the deposit/prepayment before any professional proceeds are released. A rule whose commission exceeds the deposit is blocked; customers receive a generic payment-setup message, not the hidden commission rate. Quotes, capture reconciliation, ledger proceeds, transfers and refunds retain the agreed amounts. Snapshot tables grant no UPDATE/DELETE to application or financial workers.

GLOHAUS uses **separate charges and transfers**, with a platform charge and delayed transfer. Stripe `application_fee_amount` does not apply to this pattern. Commission is retained by reducing the net transfer from the frozen quote. The charge path and release policy are unchanged.

Actual Stripe processing costs are read from the charge's GBP balance transaction, verified against the saved capture/intent, and recorded once in a separate immutable cost table plus balanced platform ledger entries. They do not change professional commission or wallet proceeds. Missing provider costs are labelled pending and retried by maintenance; estimates never enter the ledger. Cost totals cover service charge processing, not unrelated Stripe subscription/Connect monthly charges.

Collected commission and waived commission are reported only for recognized paid-booking ledger transactions. Cancelled unpaid holds earn no commission. Refunds preserve original GLOHAUS revenue and use the existing non-negative wallet/outstanding-obligation rules. Promotion reporting uses historical snapshots.

## Read-only Test Mode

The Owner can select a professional/date and resolved rule, hypothetical 0%, hypothetical 2%, or standard rate. Inputs include service price, deposit/prepayment, booking count, estimated processing percentage/fixed cost and refund amount. It calls only the protected read-only SQL resolver. It creates no booking, rule, charge, ledger entry, withdrawal, refund or email.

It shows commission, proceeds, customer payment, waiver, estimated processing cost, net platform margin (which may be negative), refund wallet effect and shortfall obligation. Invalid deposit/under-covered commission/refund setups are identified. Refund calculations explicitly assume only that booking's proceeds are available; real refunds retain the existing wallet/dispute recovery rules.

## Verification and production release

- Read-only production baseline: 11 booking quotes; zero commission arithmetic mismatches, zero proceeds mismatches, zero deferred/under-collected commission, zero negative proceeds; zero capture/quote mismatches. No live writes.
- Isolated database tests cover role/MFA/confirmation denial, 0%/2%/standard, scopes/overlap, inclusive start/exclusive expiry, immutable booking/payment snapshots, actual-cost idempotency/mismatch, founding 14+30, emergency preservation, private reads, cancellations/refunds, reporting and simulation.
- API tests verify same-origin/strict validation, Owner-only mutation/simulation, hypothetical scenarios and actual Stripe-fee reconciliation without provider writes.
- Existing full regression suite, typecheck, lint and production build are required; browser CI covers mobile/desktop in light/night, disabled controls, read-only scenarios, review/cancel/confirm and critical professional feedback.
- The local Chromium download was truncated; browser checks run in CI and retain screenshots as `commission-centre-checks`. Review those artifacts before activation.
- No new Stripe sandbox/live charge is created by the test harness. Stripe calls are isolated fixtures plus read-only production database checks. Provider fee-read permissions and real email delivery must be checked in the release environment before relying on those operational reports/notices.

After **explicit Owner approval**, apply the reviewed migration with the existing migration runner, deploy the matching source, run read-only schema/grant/pricing checks, and inspect the disabled Centre. Do not activate or create rates automatically during deployment. Owner activation is a separate confirmed, audited action; set rules at least 24 hours ahead and review notices plus Test Mode first. Real earned rewards must never be removed during rollback; retain their resolver and historical snapshots.

## Final local results and approval boundary

The final full suite passed **836 tests in 94 files**. Five additional React interface tests passed, covering disabled live controls, exact reviewed payloads, cancellation without a write, failed-save draft preservation and read-only simulation inside the actual Admin workspace confirmation boundary. Lint, TypeScript and the webpack production build passed. The isolated browser fixtures bundle successfully.

Automatic approval review rejected publishing this source branch to the user's existing **public** GitHub repository, even after verifying repository identity and permissions. Consequently no remote branch or draft PR was created, and viewport/theme browser CI has not yet run. Explicit permission to publish the source as a draft PR is needed for that final verification step. This permission does not authorise deployment, migration application, sending notices, changing production rates or activating the Centre.

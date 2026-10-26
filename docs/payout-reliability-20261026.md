# Professional payment and payout reliability

## Existing money flow

GLOHAUS already uses separate Stripe charges and transfers. A signed payment webhook records the paid booking and its ledger entries. Existing release functions make eligible service earnings available after confirmed completion plus 24 hours; disputes, verification and financial controls remain in force. Professionals choose a withdrawal in their Wallet. The server reserves the balance, transfers to that professional's connected account and requests the Stripe bank payout. The Owner does not manually pay each professional. This is professional-requested withdrawal, not a new automatic daily disbursement programme.

Existing hosted Stripe onboarding, missing-requirement display and Express payout-detail management are retained. Standard withdrawals have no GLOHAUS withdrawal fee. Instant withdrawal remains the existing optional 4% feature, gated by the existing configuration and Stripe eligibility. No fee, commission rule, founding entitlement, pricing proposal, payment key or payout schedule was changed. Stripe controls available source funds and bank settlement; a ledger balance alone cannot force a transfer or bank payout.

## Changes

- A durable professional/request UUID maps retries to one existing payout and one atomic wallet reservation. A two-minute lease prevents concurrent handlers from compensating each other. Existing financial policy checks are reused. Unresolved provider operations cannot be reissued after the 23-hour retry window, before Stripe may expire its idempotency keys. Legacy clients without a request key remain accepted; the current Wallet persists and reuses its key for a retried attempt.
- Stripe payout eligibility is read before reserving funds. Transfer references are persisted before bank payout creation and checked against account, amount, currency and metadata. Existing stable transfer/payout keys are retained.
- A network timeout or unknown provider result keeps the wallet reservation. Funds return to available only after a definitive rejection and confirmed transfer recovery. A failed reservation commit cannot cancel another handler's payout. Unknown outcomes remain visible for review and signed webhooks can recover provider records. No automatic new-money operation is performed by the reconciliation check.
- Signed payout events must match the expected connected account, bank amount, method, currency and originating transfer. Current Stripe payout status prevents an old event overwriting a newer bank failure. Repeated failure events and already reversed transfers do not restore the same funds twice. A late bank return reverses the original clearing journal rather than debiting processing twice.
- The Wallet includes lifetime paid-out totals, recent withdrawal status, fees and expected bank dates. Payments & Payouts shows pending/available earnings and estimated arrival dates. Its on-demand comparison checks up to 10 recent records against Stripe, discloses discrepancies and does not move money, modify the ledger or expose bank details. Existing Admin/MFA authorization is reused.

## Validation and limits

Local verification includes the production build, TypeScript, scoped lint, request replay/lease tests, private-table and role checks, real Stripe-SDK signature fixtures, provider failures and timeouts, transfer/account/amount mismatches, duplicate event handling and paid-then-failed ledger recovery. Provider mutations are mocked in these tests. A dedicated isolated PostgreSQL CI job runs the payout database checks; existing mobile, auth, booking, security, support and notification regressions remain enabled.

Read-only live checks found one payout-enabled connected account whose professional mapping agrees with the application. The recorded GBP 2 payment and full refund agree with Stripe. The platform has no recorded professional withdrawals and Stripe returned no Connect transfers; therefore a real professional bank payout is not verified. No sandbox journey, real charge, transfer, payout, cancellation or refund was initiated during verification. Existing live webhook endpoints are enabled for booking/refund/dispute and Connect payout/account events.

Unknown outcomes beyond the retry window, missing provider permissions, transfer recovery failures and fee mismatches require review against Stripe. The new comparison is deliberately read-only: it does not provide an unsafe "pay again" or balance-edit button. Full automatic exception recovery and per-bank arrival guarantees are not claimed. An existing bank failure can still require Stripe or bank action.

## Other requested fixes already present

The live domain belongs to `glohaus1` on `haroon-glohaus`, not the old Hobby `glohaus-app` project. Hourly maintenance and minute notification recovery are supported by the existing production plan and remain unchanged. Both had successful recent heartbeats with no recorded failures over the inspected 24-hour window. Their responsibilities and rollback guidance are documented in `cron-deployment-target.md`.

MUA is live and navigates to Makeup discovery; Waxing remains in Hair Removal. Existing carousel, Shop, PWA, map, session and grouped Owner/Admin fixes were retained. The future-category safeguards in PR #173 are merged: Teeth Whitening and Tattoos are hidden, no provider was approved, and the Owner must review the required evidence before launch. Editorial Makeup is added alongside the existing Makeup services.

Support reuses the existing Resend inbox and signed webhook, forwarding to the business Gmail with loop/deduplication protections. Two prior forwards have confirmed delivery records. Gmail replies and a full external customer reply round trip still need hands-on verification. Ticket transport association is not full Gmail conversation-body synchronisation. DNS and inboxes were not duplicated.

Physical iPhone/Android PWA chrome, installed-app push, external login/reset verification and a real bank payout remain manual checks; browser engine fixtures are not physical-device evidence. No new paid service or plan was purchased.

## Release and rollback

Apply the additive payout migration with the repository checksum before deploying its matching application. Preserve the existing financial-policy function and ledger records. The pre-payout release is production deployment `dpl_4TxXYfHCRCGVhZiR7c6kXnjS4PHu`, commit `d6df715936c72d08e714017f6d07ad307916f2d9`. If rollback is needed, promote that known-good deployment in `glohaus1`, retain the additive request/history table and earned balances, and never delete financial records or automatically resend uncertain payouts. No database down-migration is required for an application rollback.

Primary Stripe guidance used: https://docs.stripe.com/error-low-level and https://docs.stripe.com/api/idempotent_requests.

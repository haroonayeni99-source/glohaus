# Referral foundation Stage 1 — first implementation batch

Status: isolated development branch; no production migration or reward launch.

## Approved scope

The Owner approved continuing after the Step 0 inspection, specifically resolving
qualification disagreements and enforcing one referral per person. Stage 1 also
requires the unified four-channel system, immutable reward ledger, financial
safeguards, Owner controls and dry-run dashboard. This batch does not complete
that wider scope.

## Changes in this batch

- Event reconciliation and the Owner refresh now use the same database evaluator.
- Qualifying booking evidence requires completed status and completion date,
  captured on-platform payment with a provider reference and paid status, no
  refund of any amount, no dispute and no booking of one's own professional profile.
- Referral qualification waits fourteen days after completion by default. Ordinary
  consented profile-view conversion tracking retains its existing completion timing.
- Flagged or rejected reviews are reflected in qualification history without
  clearing or changing the Owner's decision.
- A permanent person-level reservation prevents a second referral across the
  existing customer and professional referral tables. The primary key is the
  concurrency boundary; no application-only check is relied on.
- Existing historical conflicts retain their source records; earliest creation date,
  then referral ID, deterministically selects the permanent reservation. Historical
  accounts are not newly rewarded or promised a reward.
- Attribution identity, code and date cannot be changed. Removing a legacy source
  record does not free the person's reservation. No new customer-facing messages,
  rewards, financial transactions, commission changes or Founding changes are created.

## Validation

Targeted local validation: 36 tests passed, one native PostgreSQL concurrency test
skipped locally. This includes applying the complete migration history to an isolated
PGlite database, both cross-channel claim directions, self-referrals, immutability,
removal/reclaim protection, Owner refresh versus event qualification, partial/full
refunds, cancellation, disputes, hold periods and missing provider references.
Native PostgreSQL execution, wider regression checks and release status are tracked
in the pull request; do not interpret the local skip as a pass.

## Still required before Stage 1 is complete

- Canonical account codes, all four channel links, signup-time capture and manual partners.
- Linking the new reservation to professional-own-customer and manual-partner claims.
- Reliable shared-device/phone/email-pattern/card/address/IP evidence and review integration.
- Append-only reward/event ledger, original-award booking uniqueness and financial reversals.
- Actual retained revenue integration, £2 minimum, 40% ceiling, audited per-channel
  settings, caps, Owner-set overall budget, dry-run accounting and launch/emergency controls.
- Central channel dashboard and all ten required Stage 1 acceptance tests.
- Verified restorable production backup before any production database change.

Rewards remain OFF. The overall budget and reward amounts have not been invented.
The unrelated fee PR remains paused. Existing Founding commitments are unchanged.

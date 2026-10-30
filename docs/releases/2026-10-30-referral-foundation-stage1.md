# GLOHAUS referral foundation — Stage 1

Status: implementation in draft PR #193, tested on isolated database copies.
No production migration, reward launch, fee change or cash payout has occurred.
All four channels default OFF, emergency stop ON, reward amounts zero and the
monthly budget unset. Only the Owner can configure and explicitly launch a channel.

## Reused foundations

Existing account/Owner/MFA permissions, professional and customer referral aliases,
booking/payment/dispute events, provider-fee reconciliation, financial journal,
review queue, growth components and scheduled maintenance remain connected.
The permanent first-attribution registry imports the earliest existing claim,
preserving historical source rows. New attribution is captured at Auth INSERT,
not from subsequently editable metadata. Signup alone never creates a reward.

## Delivered source

- One permanent random canonical code per account, explicit channel links and
  Owner-created manual partner codes with an existing credit recipient account.
- Four channels: customer, professional to professional, professionals introducing
  their own customers, and manual partners. Legacy GC/GH links remain aliases.
- Immutable first attribution with code, channel and signup date. A second claim
  is blocked across channels, including after deletion of a legacy source row.
  The old post-signup claim form/API is retired.
- One shared booking evidence check and a default 14-day completed-booking hold.
  Captured on-platform payment, completion, no refund/dispute and a genuinely new
  customer are required. Flags, self-bookings and linked accounts prevent qualification.
- Retained revenue comes from posted platform revenue and actual provider costs,
  not service value, deposits, waived commission or estimated processing fees.
  Unknown costs remain pending. Default minimum is £2; a fixed reward exceeding
  40% of retained net is refused rather than silently reduced.
- Append-only original reward and event tables. Database uniqueness covers booking
  and referral. Status changes append pending/approved/released/reversed/rejected
  events; original amounts, rule versions and dates are never rewritten. Refunds,
  disputes and confirmed disqualifying evidence append reversals automatically.
  Open review flags pause unreleased awards so an Owner clearance can resume approval;
  released credit is reversed if later evidence makes it ineligible.
- Dry-run simulations are separate from credit-bearing records. They do not consume
  real launch allocations. A booking-time switch/rule snapshot prevents retroactive
  awards for bookings made while OFF and preserves a live booking's recorded offer.
- Audited channel rules, per-person/channel monthly caps, overall monthly budget,
  explicit channel launch confirmation and an emergency stop. Emergency stop pauses
  every channel; launching one channel does not restart the others. Caps use London
  calendar months and a shared database lock. Reversed original allocations still
  count toward that month's caps and budget, conservatively.
- Salted hashes for device cookie, verified phone/billing phone, email pattern,
  Stripe card fingerprint, billing address and deployment-observed IP signals.
  Overlaps create review cases, not automatic findings of fraud. Owner review
  decisions append history. A new customer matching an older paying account is
  also flagged. Raw card/contact/address/IP values are not stored in the signal tables.
- Owner page `/admin/referrals`: one table per channel, budget/rules/launch/stop,
  partner codes, risk review, ledger history and settings audit. Historical review
  cases remain in the existing queue and contribute to the central flag counts.
  The obsolete commission-waiver planning form is replaced with the new controls.
- Scheduled catch-up processes bookings in bounded, rotating batches; source
  payment/refund/dispute changes reconcile existing rewards immediately.

## Required acceptance checks

Executed in isolated PostgreSQL-compatible fixtures. Native CI additionally checks
real PostgreSQL migrations and concurrent claims/cap allocation. Exact final-head
counts and CI links are recorded in the PR description.

| Required check | Verified behavior |
| --- | --- |
| Self-referral | Direct self claims fail; known self email creates no attribution |
| Duplicate reward | Database rejects a second original for the same booking |
| Signup only | No reward or credit event is created |
| Cancel/refund/dispute | Booking cannot qualify |
| Refund after reward | Released credit receives a negative reversal event |
| Founding protection | Existing 0% rule dates and legacy eligibility are unchanged |
| Minimum revenue | £1.99 retained net is refused under the £2 default |
| Caps | Person/channel/budget limits pause new allocations; native cap race permits one winner |
| Master OFF | Only simulation rows are written; OFF-period bookings cannot be awarded after launch |
| Append-only | Update/delete/truncate attempts fail for ledger and settings history |

Additional checks cover all four channels, actual-fee double-count prevention,
unknown-cost holds, 40% ceiling, immutable signup metadata, risk review, private
signal access, emergency stop, locked offers and Owner-page authorization/outages.

## Release gates and practical limits

1. Finish final-head CI and preview review. A Vercel frontend preview alone is not
   proof that these database migrations are installed on an isolated hosted backend.
2. Take and verify a restorable production database backup before any production
   database change. The connected database tool has no backup/export operation;
   the Supabase dashboard currently requires sign-in in the cloud browser.
3. Apply verified changes only to the production database associated with glohaus1,
   then deploy the matching glohaus1 application and verify tracking and Owner access.
   Re-check that every reward channel remains OFF and the budget remains unset.
4. Reward launch is a separate, future Owner approval. Do not enable channels,
   create real reward records, release credits or run cash payouts during deployment.

Historical device/IP/card/address evidence cannot be invented: coverage starts
when the corresponding security sign-in or verified payment path observes it.
The device signal is a first-party security cookie, not a hardware identity.
Shared-household signals can be legitimate and require review. Customer-facing
credit redemption and partner portals are not added in this infrastructure stage.
The unrelated booking-fee PR remains paused. No Founding commitments are changed.

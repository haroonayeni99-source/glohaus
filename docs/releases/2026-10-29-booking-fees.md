# Booking-fee release

Target: `haroon-glohaus/glohaus1`, `www.glohaus.shop`.

## Implementation

- Standard and referred first-booking fees are independently Owner-configurable, with a recorded reason, Owner/MFA checks and financial audit entries. Promotional fee cannot exceed standard fee.
- The staged migration leaves pricing unchanged and the promotion disabled. Public FAQ and Terms read actual configured public fees; unavailable fee data is described without inventing a price.
- Verified session identity supplies booking-policy previews. Guests can inspect standard fees; supplied customer identifiers are ignored.
- Eligible customers have a valid pre-recorded customer referral or professional invitation and no previous qualifying platform booking. Existing clients brought by a professional can qualify when new to GLOHAUS.
- Active holds reserve eligibility; expired, failed, cancelled or refunded bookings do not permanently consume it. Open disputes and existing review cases can defer the offer. Self-referrals, invalid claims and duplicate email identities do not qualify.
- Identity, customer and configuration advisory locks serialize reservations and settings changes. Policy tokens are revalidated after acquiring locks. A stale discounted policy fails before checkout. Accepted policy, commission terms and financial quote retain the exact same fee.
- Old bookings and payment records keep their existing snapshots. Stripe uses the stored quote; confirmation copy itemises any included referral discount. Product fees, commissions, withdrawals and wallets are unchanged.
- Cash rewards and payouts remain disabled. This release does not claim to complete the ambassador/rewards pipeline or detect identities that cannot be reliably linked from existing account evidence. No new device/IP tracking is introduced.

## Rollout

1. Run TypeScript, lint, unit/integration tests, production build and CI, including the dedicated native PostgreSQL simultaneous-reservation and duplicate-identity tests.
2. Apply `db/migrations/20261029233131_referred_booking_fees.sql`; verify grants, the disabled promotion and the unchanged current fee. Record its exact checksum in the application migration ledger.
3. Deploy and verify the application commit on `glohaus1` and `www.glohaus.shop`.
4. Execute the audited configuration operation `db/releases/referred_booking_fees_activation.sql` only after deployment verification. It activates £1.50 standard / £1 eligible referred first-booking fees atomically, rejects unexpected pre-rollout settings, and will not overwrite later Owner edits if replayed.
5. Verify public configuration, Owner settings and live responses. Do not generate real charges to test the release.

## Verification checkpoint

Local full suite: 1,591 passed, 3 skipped before the additional native-only duplicate-identity case; targeted fee, identity and disclosure cases pass. TypeScript and production build pass. Full lint rerun passed after moving a generated CLI directory out of the repository. Native concurrency checks, production migration, application rollout and configuration activation remain gated on CI and production verification.

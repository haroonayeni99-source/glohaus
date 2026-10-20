# Growth / referrals production rollout checklist

Status: **NOT LIVE — migration is preparatory only.**

- [x] Pure eligibility rules and tests for first-party, consented profile-to-booking attribution.
- [x] Pure qualification and fraud-review signals, with rewards hard disabled.
- [x] New RLS-locked schema for profile events, booking attribution, referral status audit and discretionary owner appreciation proposals.
- [ ] Review privacy lawful basis, opt-in UX, retention, erasure/export policies and DPA/ICO requirements. Do not capture visitor identities before this is complete.
- [ ] Implement authenticated opt-in event recording with deduplication/rate limits. Aggregate profile-open system remains as-is.
- [ ] Build transactional booking attribution from actual completed/paid booking states and handle later refunds/disputes; enforce one eligible view per booking.
- [ ] Create owner-scoped SQL functions and private role-based dashboards. No direct browser database table access.
- [ ] Build referral qualification write pipeline and idempotent audit transitions; only flag suspected abuse for manual review.
- [ ] Add Owner-approved recognition proposal + approval UI. No gift/payout action, reward thresholds, cash or platform wallet integrations.
- [ ] Evaluate full booking/payment integration tests, migration in isolated Supabase, row-level security tests, TypeScript, lint and end-to-end flows.
- [ ] Deploy migration before any dependent app code, and confirm production explicitly.

**Important:** migrations only define storage. They neither capture events nor produce truthful view-to-booking conversion reports until the above application components exist. There must be no fabricated historical attribution or rewards.

Owner policy: Recognition is discretionary. The Owner may select a loyal professional and send congratulations, a physical gift or separately approved money, but no behaviour automatically qualifies anyone for a reward. Gifts must not be exchanged for reviews. Automatic referral rewards remain OFF.

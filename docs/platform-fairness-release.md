# GLOHAUS reliability and fairness release

## Scope and preservation

Extends the existing Owner Control Centre, Growth & Performance, support inbox, review moderation and appointment pages. Live payment provider configuration, commission resolution, financial quotes, deposits, withdrawals and payout/dispute workers are preserved. Proposed source rates remain in a separate draft table with no financial consumer. Founding Programme ships **open** and is not closed or retired by this release. Existing Commission Control Centre activation stays unchanged.

## Audit and implementation

- Existing mobile category/PWA theme fixes from main `ed4b9c0` are retained. Existing error boundaries, retry screens, job heartbeats, authenticated uploads, session safeguards, booking policies, verification badges, privacy/marketing settings, dispute freezes, refund accounting, wallet histories and notification delivery remain in place.
- New programme controls: Owner/MFA, reasons, confirmations, immutable retirement, database enrolment gate with locking, public-offer gate and audit records. Existing trials and feedback rewards are never removed; ordinary professional registration is independent.
- New acquisition reporting: optional customer confirmations; independent professional challenges; invitation links and downloadable QR codes; existing referrals and consented profile evidence; deduplicated customer/professional records; immutable decision history; Owner review; source/returning/bookings/value/recorded-commission reports in existing weekly/monthly/yearly views. Unknown history is never fabricated. An invitation alone never establishes acquisition or customer ownership. A later invitation cannot override an earlier consented profile visit; conflicting chronology goes to review. Returning bookings retain original source and include earlier completed appointments outside the report period. Reports are computed automatically from current booking/payment/dispute eligibility, without triggers that could block payments.
- Draft source pricing: proposed professional 2%, first GLOHAUS booking 8%, returning 2%; editable only as an inactive draft. No activation endpoint or live fee consumer exists.
- Support: existing inbox extended with private guest case links (only token hashes stored), status/reason history, public replies versus staff notes, two-weekday response targets, limited sanitised screenshot evidence, customer appeals, Owner escalation decisions, and a durable/retrying/idempotent Resend alert queue to `glohausuk@gmail.com`. Acceptance by Resend is not labelled delivery. Inbound Gmail is not synchronised. `support@glohaus.shop` remains a future address pending verified mailbox/forwarding.
- Reviews: booked professionals can respond, response revisions are retained, hidden responses stay hidden after editing, and staff moderate responses in the existing review area. Both parties have reporting/appeal entrypoints using the existing safety/support systems. Contact reports retain the review reference.
- Financial disclosure: original quoted service value, customer booking fee, professional commission, allocated processing cost, expected original earnings and refunds are read-only on the professional appointment. It directs users to actual wallet funds/holds/history rather than presenting a quote as withdrawable money.
- Privacy: source/support handling and contact methods for eligible data requests are explained; existing marketing consent and essential notifications are retained.

## Verification and rollout

All new migrations were applied successfully to the isolated Supabase validation project before production. Real PostgreSQL Owner report queries succeeded in a rolled-back fixture. Advisors reported no new security findings; existing private no-policy tables and the intentionally public maintenance boolean were not opened to silence warnings. Local database tests cover role boundaries, MFA, retirement confirmation, retained benefits, unchanged fee settings, source conflicts, returns across periods, refunds, support token isolation, internal notes, appeals, evidence caps, queue claiming, and review-response moderation.

No Stripe sandbox journey, real charge, booking, refund or withdrawal was performed. Tests of financial calculations run only against disposable local data. No actual support email is sent by test fixtures.

Release gate: full automated suite, lint, typecheck, clean production build, secret scan, dependency audit, and hosted CI browser regressions. Browser evidence distinguishes actual WebKit/iPhone checks, Android/desktop emulation and mocked provider interactions from live signed-in provider verification.

## Rollback

Pre-release production: `dpl_ADHTfWiSogV1kk2oGMQ1HrH1f2xG`, commit `ed4b9c0c23f5ba190c44d8313bf346ece4715983` on `glohaus1`, team `team_bt39lAKNGwFdn1g6Lynl2MrT`. Reassign/promote that known patched deployment if the release has a material production regression. Retain additive database tables and historical support/source records. Do not delete earned benefits, reverse financial events or remove database constraints to roll back UI. Preserve Node 24.22.1 security floor. A deployment rollback may require explicitly restoring automatic alias assignment for later releases.

## Remaining manual verification

Live Owner uploads/MFA with an actual signed-in Owner session; full external authentication/verification/reset-mail journeys; real-device notification delivery and installed-app OS chrome. Isolated browser assertions and public HTTP success must not be represented as proof of those provider/device journeys. Future support mailbox/forwarding requires separate verification. Acquisition reports cannot prove historical sources where no reliable evidence exists. Formal retention scheduling and disputed legal/consumer/privacy decisions need operational review; data requests use the private support workflow.

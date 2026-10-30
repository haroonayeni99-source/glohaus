# Consent-aware rebooking pilot

Automation defaults OFF. The Owner can configure visit delay (default 28 days), customer-wide cooldown (30 days), daily platform cap (25) and monthly cap (100), or stop immediately independently of the settings form. Every change uses the existing verified Owner boundary and audit. Zero caps pause new queue entries.

Eligible customers must have explicitly opted into rebooking marketing and have a completed, on-platform paid, unrefunded, undisputed visit with an active public professional and active service. Skip blocked/restricted/deleted/suppressed accounts, customers with future confirmed or unexpired pending appointments, and earlier visits superseded by a later completed visit. Only a seven-day eligibility window is processed, preventing old lists becoming backlog campaigns. Imported contacts never qualify.

Use a private durable outbox, unique booking constraint, serialized preparation, claim leases, at most three attempts inside a 23-hour provider idempotency window, and a stable provider key. Recheck consent and eligibility immediately before each send. The existing optional-marketing unsubscribe page is linked in plain-text email; no account or booking is created. Verified tagged delivery events handle bounce/complaint suppression, including events arriving before the send acknowledgement. The stop cannot recall email already submitted to the provider.

Internal beauty_admin_ops gains SELECT on client blocks and INSERT/UPDATE on email suppressions for the bounded procedures. No direct application/anonymous table access is granted. Settings/outbox/event tables have forced RLS. Existing notification channels continue independently if this worker fails; absent migrations make the new worker a no-op.

Verified: 35 focused/regression tests across five files passed, including database roles/qualification/consent/caps/stop/backlog/retry limits/provider-event races, mock provider delivery, API Owner/origin/input guards, and notification worker isolation. TypeScript, targeted lint and production build passed. Hosted isolated staging migration and rollback-only queue/opt-out/stop smoke passed under operator context; no actual email was sent. Staging security advisor reported no rebooking-specific finding.

Not production deployed. Full final-head CI, authenticated hosted UI review, and verified restorable production backup remain release gates. Existing pricing, commissions, financial commitments and referral rewards are unchanged. The pilot is disabled on staging after the rollback.

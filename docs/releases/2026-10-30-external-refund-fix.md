# External booking-refund reconciliation correction

Production migration/function reads on 30 October 2026 show that the existing payment worker has SELECT but no UPDATE privilege on bookings. External-refund reconciliation nevertheless locks that read-only booking row FOR UPDATE. The initial isolated regression fails with `permission denied for table bookings`. The function also uses `SET provider_status=provider_status`, which leaves the parameter and column ambiguous when a pending refund later succeeds.

The additive migration preserves the payment-row lock that serialises refunds, removes only the unnecessary booking-row lock and qualifies the existing status parameter. It keeps the function owner, signature, grants, security mode, refund rules and financial recovery logic unchanged. Unexpected function definitions cause the migration to fail rather than guess.

The regression runs on disposable native PostgreSQL because the existing PGlite engine has a documented SECURITY DEFINER/FORCE RLS limitation. It covers pending -> succeeded, distinct duplicate provider events, one refund row, one ledger transaction and the final captured/refunded balance. Existing normal refund tests continue to run in the ordinary suite. The native job has its own disposable database service; no production or staging connection is accepted by the test adapter.

Status: draft correction awaiting native CI verification and staging review. Production application is blocked until a verified restorable production backup is available. No live refund, payment or schema change was initiated.

The Supabase CLI generated the migration filename before automatic approval review rejected an unsolicited PostHog telemetry attempt. The CLI was not rerun; the already-created file was completed locally. No telemetry workaround or new provider credentials were used.

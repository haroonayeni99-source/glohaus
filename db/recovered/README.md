# Recovered prerequisites

These definitions fill gaps in the repository's numbered migration chain. Production inspection on 2026-10-10 used read-only Supabase metadata queries. No production rows, credentials, or provider tokens are included.

| File | Authoritative source and scope |
| --- | --- |
| 20261002113851_owner_auth_visibility_and_professional_commission_overrides.sql | Existing Supabase migration with the same version/name; table and RLS DDL only, excluding backfills and other routines. |
| 20261004180215_owner_public_site_availability_control.sql | Existing Supabase migration with the same version/name; runtime settings table and RLS DDL only, excluding inserted settings and routines. |
| 20261005205027_professional_booking_dispute_responses.sql | Existing Supabase migration with the same version/name; dispute response table, RLS, and table grants only. |
| 20261010_professional_referrals.sql | Production pg_catalog table/constraint metadata and pg_get_functiondef for the two existing referral overview functions. No referral rows or reward backfills. |
| 20261010_privileged_function_prerequisites.sql | Production pg_get_functiondef for functions referenced by migration 0098, plus existing verification-tier column definitions. No new triggers are attached. |
| 20261010_starter_reservation_definition.sql | Production pg_get_functiondef of reserve_booking(uuid,timestamptz); restores the already-live full-prepayment behavior needed by migration 0115. |

scripts/migration-plan.mjs inserts these prerequisites before dependent numbered migrations. Tests, migration status, and the runner share that plan. Original numbered migrations remain byte-for-byte unchanged.

Financial routines reproduce existing production definitions; this release does not choose new payment rules or execute these files against production. The custom ledger and Supabase history remain divergent, so the runner's existing drift guard must remain enabled. Reconcile those histories in an explicitly reviewed operational change before using the runner on production.

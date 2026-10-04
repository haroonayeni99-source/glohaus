# Account schema and authentication verification

Migration `0092_account_restrictions_and_deletion.sql` supplies the restriction,
reason and deletion columns that account reads and owner controls already use.
It adds narrowly scoped, checked owner routines and an admin user-list routine.
Existing migrations are unchanged. The runtime login receives no new membership,
no schema CREATE privilege, and no direct write access to these account fields.
The existing admin operator owns the routines, keeps NOLOGIN/NOSUPERUSER/NOBYPASSRLS,
and receives schema CREATE only during ownership transfer; it is immediately revoked.
All owner writes require the existing owner/MFA boundary and record an audit event.
The single owner cannot be restricted or deleted. Deletion retains relational
booking/financial history while marking the application account removed and
anonymising its displayed name/email. Supabase Auth deletion remains a separate,
server-only operation; tests do not contact Auth or delete production accounts.

## Operator rollout

No production migration is executed by the test suite or this repair.
Production inspection subsequently found two independent migration histories:
`public.beauty_schema_migrations` and `supabase_migrations.schema_migrations`.
The restriction/deletion columns already exist via the Supabase history.
**Do not run a bulk `pnpm db:migrate` against that existing production database.**
It could attempt to recreate tables installed through the other history.
See [the targeted public fee/security repair](public-fee-and-security-repair.md)
for the reviewed forward patch. The complete repository migration chain remains
valid for isolated fresh databases, but its legacy history needs a separate,
reviewed reconciliation before bulk production migrations resume. No history
rows or applied SQL files should be changed manually.

## Verification boundaries

The suite runs the complete migration chain against isolated PGlite PostgreSQL
instances. It verifies enrollment idempotency, customer/professional isolation,
booking conflicts, messaging access, owner protection, MFA checks, restrictions,
RPC enrollment, immutable financial records and audit logging. Form tests verify
provider responses, email confirmation and session-refresh retries. They mock the
external Supabase provider; they do not prove delivery of confirmation emails,
production cookie behaviour or production provider credentials.

After operator rollout, test a real customer and professional account in a clean
browser: anonymous discovery, signup/email confirmation, sign-in, refresh, role
appropriate dashboard, protected requests and logout. Test owner access with MFA.
A local green test suite is not a claim that those external production checks ran.

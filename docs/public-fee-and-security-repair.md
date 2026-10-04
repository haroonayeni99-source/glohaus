# Public booking fee and security repair

## Root cause and migration 0093

The production `public_booking_fee_pence()` was changed outside the repository
from a constant into an invoker query on `financial_fee_rules`. The web role has
no read grant/policy on that private table. The error aborts profile transactions.
0093 captures the intended configurable fee and repairs its access boundary:

- `beauty.public_booking_fee` returns only the current global customer booking
  fee (existing £1 default if no matching rule exists).
- The existing NOLOGIN/NOBYPASSRLS catalogue role owns the view. Its column grants
  and RLS policy cover only current public customer booking fees, not private
  commission policies, creator identities, inactive, future or expired rules.
- The fee function remains SECURITY INVOKER. Web/booking/payment/finance roles
  read the scalar view; the web role cannot read the financial table directly.
- Temporary schema CREATE for view ownership is revoked immediately.
- An existing production-only commission override table gains a SELECT policy
  only for its existing restricted financial reader. RLS is forced; no browser
  table grants or Owner authorization changes are introduced.

The two intentional account RPCs move their checked implementation into
`beauty_private`; public wrappers become SECURITY INVOKER. Authenticated callers
retain self-service account access via `auth.uid()`, verified email, validated
customer/professional roles and the restriction/deletion guards from 0092.
Anonymous and PUBLIC execution is revoked. No direct app-table grants or
privileged database credentials are issued to browser users. Keep
`beauty_private` OUT of Supabase Data API exposed schemas. The wrappers need
USAGE and function EXECUTE there, but no CREATE or table access. Their privileged
implementation is intentionally retained, tested and not exposed through a
private-schema PostgREST endpoint.

## Connection handling

The runtime wraps each transaction's SQL client with a query queue. Concurrent
repository callers are ordered, in-flight work drains before COMMIT/ROLLBACK,
and the first query failure prevents later queued queries from executing.
The admin loader no longer starts twelve competing transactions against a
single-connection pool. Pool size, runtime role checks and TLS settings are not
changed. These address known contention; they do not prove that every historical
network timeout has been eliminated.

## Operator rollout

No production migration is run by this repair. Live inspection found that
`public.beauty_schema_migrations` ends at 0025, while subsequent changes are
recorded separately in `supabase_migrations.schema_migrations`. The live account
restriction columns already exist through that second history.

**Do not run a bulk `pnpm db:migrate` against this live database for this repair.**
It would attempt to recreate objects already installed under the Supabase history.
Do not manually mark earlier files applied or change their checksums. The
reviewed 0093 SQL is a targeted forward migration compatible with the confirmed
live objects and can be recorded through Supabase's migration system after
operator approval. It reasserts the RPC restriction/deletion guard without
recreating existing account columns. The same file also passes the complete
fresh-database migration chain in tests.

After applying the targeted repair, open a real `/p/[slug]` profile signed out
and verify the visible fee matches the Owner-configured fee. Verify new bookings
use that same fee and old quotes remain unchanged. Run Supabase security advisors
again and verify `beauty_private` is not in Data API exposed schemas. Reconcile
the two migration histories as a separate reviewed operation before resuming
bulk repository migrations.

## Leaked-password protection

This is a Supabase Auth project setting, not an SQL migration or application
password validation replacement. Sign into the dashboard for project
`tyycrmmczsgnowditnii`, open Authentication → Sign In / Providers → Email and
enable leaked-password protection. If unavailable, check your plan: Supabase
requires Pro or above. This repair never upgrades the plan or changes billing.

Official references:
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable

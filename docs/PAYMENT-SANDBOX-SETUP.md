# GLOHAUS sandbox payment setup

The existing Glohaus Stripe sandbox is `acct_1UHzBGV051bQOeWL`.
Use test credentials only until a complete booking and its ledger entries have
been verified. A successful deployment does not establish payment readiness.

## Server environment

Configure these in the existing Vercel `glohaus1` production environment:

- `STRIPE_SECRET_KEY`: the Glohaus sandbox secret key; never a live key during testing.
- `STRIPE_WEBHOOK_SECRET`: the platform payment endpoint signing secret.
- `STRIPE_CONNECT_WEBHOOK_SECRET`: the connected-account endpoint signing secret.
- `PAYMENT_DATABASE_URL`: the dedicated `glohaus_payment_runtime` pooled connection.
- `PAYMENT_DATABASE_CA_CERT`: the public Supabase database CA certificate in PEM format.

Store the four credentials as sensitive Vercel variables. They must never use a
`NEXT_PUBLIC_` prefix. The CA certificate is public configuration, not a secret.
Redeploy after environment changes.

Both existing webhook endpoints use `/api/webhooks/stripe`. The platform
endpoint handles checkout completion and asynchronous outcomes, refunds,
subscription changes and disputes. The Connect endpoint handles account updates
and payout outcomes. Reuse their existing secrets; do not create duplicate
endpoints solely to obtain another secret.

## Restricted database login

Migration `0095_payment_runtime_login_role.sql` creates an inert role without a
password. It grants membership only in `beauty_payment_worker`; the web account
retains its separate `beauty_app` membership. The payment login has no direct
application-table grants, object ownership, superuser or RLS bypass permissions.

The production role was provisioned through the trusted operator connection.
Its generated password was stored directly in Vercel and was not committed.
Rotate it through a trusted operator connection, supplying the replacement
secret securely and updating Vercel together. Never use the Supabase `postgres`
credential as `PAYMENT_DATABASE_URL`.

The pooler username is `glohaus_payment_runtime.tyycrmmczsgnowditnii`.
Use the project's transaction pooler on port 6543 and the `postgres` database.
The payment pool uses two connections and transaction-local role switching.

Payment connections always verify both the certificate chain and hostname.
Connection-string SSL flags cannot override this. Obtain the database CA from
Supabase's Database Settings / SSL Configuration. See
[Supabase SSL guidance](https://supabase.com/docs/guides/platform/ssl-enforcement).
Do not disable certificate verification when a CA is missing.

Production has separate historical migration tracking systems. The payment-role
change is recorded in Supabase migration history as `payment_runtime_login_role`.
Do not run all historical migrations again against production.

## Required final acceptance test

1. Authenticate as a test customer and select a real test professional/service.
2. Reserve a genuinely available slot and inspect the server-calculated quote.
3. Complete Stripe-hosted Checkout with a Stripe test card.
4. Verify a signed Stripe event is successfully delivered to the endpoint.
5. Verify the booking is confirmed, its payment is paid, and the provider intent
   and session match the booking.
6. Compare the financial quote's deposit and fees with balanced ledger entries
   and the professional's wallet. A deposit is not automatically withdrawable;
   the existing release rules still apply.
7. Redeliver the event and verify no duplicate payment, booking or ledger entry.
8. Verify a failed payment does not confirm the booking.

Do not claim this acceptance test has passed until the Stripe event, application
booking, and wallet records have all been checked. Do not enable live money as
part of sandbox configuration.

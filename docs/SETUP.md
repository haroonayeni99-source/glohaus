# Provider setup and deployment

Use separate development/staging and production resources. Keep every secret in environment variables. The .env.example file is the complete inventory of variables currently consumed by the application; do not commit .env.local.

## 1. Clerk and PostgreSQL

Create a development Clerk application, enable verified email and second-factor authentication, and configure the application origin and sign-in/sign-up URLs. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY. Admin users need recent second-factor verification, not simply MFA enrollment.

Create PostgreSQL and keep the privileged operator connection on the migration machine only as MIGRATION_DATABASE_URL. Run `pnpm db:migrate`. Migrations 0001–0016 create accounts, profiles/services, posts, admin operations, availability, bookings/payments, reviews, notifications, portfolio, post images, refunds the minimum positive GBP deposit, extended profiles/photos, zero-deposit booking independence and booking-list and discovery-order indexes. Applied migrations are checksum-checked; append migrations rather than editing deployed ones.

Have the database administrator create two distinct runtime logins, both NOSUPERUSER and NOBYPASSRLS, without application table ownership or membership in any owner role:

- DATABASE_URL: membership in beauty_app only.
- PAYMENT_DATABASE_URL: membership in beauty_payment_worker only.

Do not grant either login beauty_admin_ops or beauty_booking_ops. These are internal function-owner roles. Do not use the migration credential in the deployed app. Use the provider's TLS-enabled compatible pooled endpoints and verify actual permissions in staging. The application rejects privileged runtime credentials.

Restart, sign up, verify email and select Customer or Beauty Professional at /onboarding. Create at least two of each role for isolation testing. To bootstrap admin, enroll a real account and enable MFA, then run on the operator machine:

```sh
pnpm admin:grant user_ID operator-reference "Reason for access"
```

Admin grants are audited. The operator needs access to forced-RLS tables; a normal table owner without suitable privileges can be denied.

## 2. Stripe deposits and refunds

Use Stripe test mode first. Configure STRIPE_SECRET_KEY and platform/Connect webhook signing secrets. Route both webhook configurations to /api/webhooks/stripe. Subscribe to checkout.session.completed, account.updated, refund.created and refund.updated as appropriate to platform and connected-account events. Confirm event routing and account context with Stripe test tools before live activation.

Professionals use the hosted Connect onboarding action in their profile. GB Express connected accounts must be ready to accept charges and payouts. Customer deposits use hosted card Checkout with destination charges. Positive deposits must be at least 30p; zero-deposit services can be booked without Stripe setup. They still require verified customer/professional accounts, a published service and working hours. Positive deposits require a ready connected account and configured runtime credentials.

Never add card input fields or card data to the database. Store only provider references and the application's monetary/status records. Test successful/failed/late Checkout, duplicate events, cancellation and partial/full refunds. Do not enable live mode until external refunds/disputes and admin appeal handling are completed.

Reference: [Stripe destination charges](https://docs.stripe.com/connect/destination-charges), [supported currency minimums](https://docs.stripe.com/currencies?locale=en-GB).

## 3. Private images

Create a PRIVATE Vercel Blob store and set BLOB_READ_WRITE_TOKEN. Files are served through /api/media/[id], after public visibility or owner authorization checks. Do not change the store to public. Current uploads accept JPEG, PNG or WebP up to 3 MB; the server bounds pixel count, resizes and strips metadata. Video storage/transcoding is not implemented.

Reference: [Vercel private storage](https://vercel.com/docs/vercel-blob/private-storage).

## 4. Email and scheduling

Create a Resend account, verify a sender domain and set RESEND_API_KEY and EMAIL_FROM. Set a random high-entropy CRON_SECRET. Invoke GET /api/cron/notifications with `Authorization: Bearer <CRON_SECRET>` from an authorized scheduler, typically every five minutes. Do not embed the secret in the URL. Confirm your hosting plan supports the required frequency before configuring it; no paid scheduler has been purchased or enabled.

The worker leases queued notifications, retries failures and uses deterministic Resend idempotency keys. It stops retries before the provider's 24-hour idempotency window ends; failed/stalled jobs therefore require operational monitoring. Reminder/review eligibility is checked against booking state. No real messages have been sent during development.

Reference: [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

## 5. Vercel release process

1. Import outputs/beauty-platform as the project root. Use the pinned pnpm version and a supported Node.js version satisfying package.json.
2. Create isolated preview/staging resources; never point untrusted preview branches at production credentials.
3. Configure runtime variables from .env.example, excluding MIGRATION_DATABASE_URL. NEXT_PUBLIC_APP_URL must equal the canonical HTTPS deployment origin. Configure Clerk and Stripe URLs for that environment.
4. Run lint, typecheck, tests and build in CI. Apply reviewed migrations separately with the operator credential, then deploy compatible application code.
5. Run real provider end-to-end and cross-account security checks, including independent-connection booking contention. Verify webhook signatures, duplicate handling and notification delivery.
6. Enable the scheduler only after verifying its authenticated endpoint and email sender. Configure database backups, restore testing, restricted operational access and redacted error/queue monitoring.
7. Promote only after the launch gates in IMPLEMENTATION-STATUS.md are resolved. Roll back code only when compatible with the migrated schema; use forward corrective migrations rather than destructive rollback.

No deployment has been performed. The local preview remains useful without these credentials, while private and payment actions stay unavailable.

Service images additionally require migration `0017_service_images.sql`; the migration runner applies pending migrations in order. Existing services receive no image by default. See [service management](SERVICE-MANAGEMENT.md).

Apply migrations `0018_post_engagement.sql` and `0019_platform_labels.sql` for private likes/saves and admin-editable display names. They introduce no new environment variables. Admin label editing uses the existing fresh-MFA requirement. Guest preferences use local browser storage; account-backed community preferences require Clerk and PostgreSQL.

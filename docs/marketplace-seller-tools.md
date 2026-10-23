# Marketplace seller tools

This branch adds a first release of seller tools to the existing beauty-products marketplace. It does not integrate with eBay. No production database migration, production release, credential change or live financial transaction has been performed.

## Implemented in this branch

- `/professional/seller-hub`: authenticated seller workspace linking listings, orders/tracking, genuine previous-price promotions, messages, wallet and order support.
- Shop-only performance: gross product sales and paid orders over a rolling 30 days, orders requiring fulfilment, low-stock listings and the top ten own-shop products by units sold. Only actual paid/processing/shipped/delivered orders count. Cancelled/refund-pending/refunded orders are excluded. Partial refunds are not subtracted; these are clearly labelled gross figures, not net earnings or wallet balances. Buyer addresses and payment identifiers are not used for these aggregates.
- Time Away: seller-owned settings with an optional UTC resume time. Paused listings stay visible and are labelled Seller away. Server/database guards block new cart additions, positive quantity changes and new checkout reservations for the paused shop. Existing carts become unavailable but remain removable. Return times automatically expire without a cron task. Service availability is unchanged.
- Already-reserved checkout sessions may finish before their expiry. No Stripe session is automatically cancelled. Existing paid orders can still be processed, shipped, delivered or handled through the existing refund workflow.
- Fact-based listing template: prepares an editable description from the seller’s supplied product name and facts. It does not invent ingredients, effectiveness, safety claims or reviews, and does not publish automatically. It is explicitly a template, not an AI model.
- Buyer-reply templates: status or order-issue replies based on existing order state, with editable text and a link to messages. Nothing is sent automatically. Refund-pending is distinguished from a provider-confirmed refund. Tracking replies do not invent delivery estimates.
- Order-review guidance: receipts, tracking, photos and conversations to retain, plus the existing GLOHAUS support route. No new automatic refund, seller guarantee, label credit or dispute decision is implied.

All existing marketplace fee rules, booking rules, balances, transfers, release windows, withdrawal fees, verification, and Owner/Admin permissions are preserved. There are no new runtime environment variables or paid dependencies.

## What already existed

Products, stock and verified-seller publishing; real prior-price deal listings; paid orders; manual carrier/tracking entry and supported-carrier links; queued transactional order/shipping emails; buyer messaging; pre-shipment refunds; wallet and payout controls; and GLOHAUS support intake. The new hub connects these tools rather than replacing their business rules.

## Remaining feature work

| Requested capability | Work needed before enabling it |
| --- | --- |
| Automatic labels, tracking and ETAs | Connect a selected shipping provider and configure signed, idempotent carrier webhooks. Store label-created, dispatched, delivered and exception events separately. A printed label must not release proceeds. Display carrier-supplied estimates with their source and timestamp, rather than inventing an ETA. Handle retries and stale/out-of-order events. |
| Coupons and multi-buy | Implement seller-funded discount rules and checkout validation, including seller/product scope, minimum quantities, expiry, usage limits, redemption locking, rounding, stacking and abuse limits. Snapshot final line prices before Stripe Checkout. Verify existing commission rules and partial/full refunds against those discounted prices. The existing previous-price deal editor is not a coupon system. |
| Offers to interested buyers | First implement a real wishlist/follow-interest signal and opt-in marketing audience. Current decorative hearts are not a verified audience. Add opt-outs, frequency limits, seller isolation, offer eligibility/expiry and consent checks. Do not send unsolicited offers or expose buyer lists. |
| AI descriptions and reply drafts | Choose and configure an actual model service with budget limits and server-only credentials. Provide only required product facts; avoid transmitting buyer addresses/payment data. Require seller review and keep generated claims grounded. Current editable templates need no provider or credentials. |
| Background photo editing | Add a real image-editing integration with preview and explicit apply. Keep the original, verify image ownership and avoid changing product appearance, colour, quantity or condition. |
| Enhanced returns/fraud protection | Build order-linked evidence, immutable case history, seller response deadlines, admin review and policy-based outcomes around the existing refund/dispute ledger. Separately approve any platform-funded return-label credit or financial protection programme. Never advertise eBay-specific protections as GLOHAUS guarantees. |
| Category-wide market research | Aggregate genuine sufficiently sized marketplace activity with privacy thresholds. Show sample size and date range. Do not fabricate trending products, external competitor prices, buyers or testimonials. Own-shop analytics are implemented now. |
| Automated feedback | Keep transactional notifications separate from reviews. Only genuine purchasers may provide their own feedback; do not auto-create positive reviews. |

## Security and isolation

The new table has forced row-level security and ownership checks on both reads and writes. Client requests cannot supply another professional ID. PUT requires same-origin JSON, strict input validation and a small body limit. Responses are private/no-store. The non-login `beauty_seller_ops` role can read only seller settings for the public paused-state boolean; its function has a fixed search path and no public execution grant. Cart/checkout checks retain the existing account visibility safeguards. Settings changes and cart/checkout insertion use a per-seller transaction advisory lock. Concurrent native-Postgres load testing remains a staging release check; PGlite tests do not prove multi-connection lock behaviour.

## Database release and rollback

The additive migration was created using the Supabase CLI with telemetry disabled and moved into this repository’s established `db/migrations` history. Do not run a separate Supabase migration history for it. Do not edit applied migration checksums. The migration fails closed if the existing guarded function definitions no longer match its expected anchors.

Apply the migration only to an isolated staging database first using the repository migration runner. Confirm default shops accept orders, seller isolation, pause/resume, mixed-shop checkout rejection, unchanged stock on rejection, ordinary paid checkout, signed webhook fulfilment, notifications, refunds and wallet release rules. Use Stripe test mode only. Test actual mobile/desktop, both themes, and browser flows before release.

Production requires explicit approval for both the database migration and application release. Existing shops default to accepting orders; no settings rows or product records are bulk-changed by the migration. The pending Node.js security follow-up is a separate branch and is not included in this feature branch.

Keep the prior deployment available. If rolling back after sellers activate Time Away, coordinate the UI rollback with a reviewed compensating migration that disables the new pause guards while preserving seller settings and all financial records; simply rolling back code could leave active pauses without their controls. Do not delete products, orders, users, balances or migration history to roll back.

## Validation

Local checks on Node.js 24.22.1:

- PASS: 1,297 automated tests across 150 test files, including 20 new seller database/API/UI tests.
- PASS: TypeScript type check.
- PASS: production Next.js build (all routes compiled, including Seller Hub and settings API).
- PASS: lint with no errors. Two existing image-optimisation warnings remain in `src/app/loading.tsx`.
- PASS: repository secret scanner and whitespace check (run before branch publication).
- NOT VERIFIED: authenticated browser/staging flows, native PostgreSQL multi-connection locking and carrier/model-backed integrations. A successful build is not proof of those integrations.

No production or Stripe live payment activity is part of validation. The database tests use isolated PGlite fixtures; they are not Stripe sandbox end-to-end payment tests. The feature branch is based on production commit `6a445b70df64548927ab5ea830094c6817eb5363` and does not include the separate pending Node runtime security branch.

# Product marketplace extension — direct purchasing selected

The user has requested products attached to professionals' services and discovery content. Product selling is additional to appointment deposits. Neither a functioning product marketplace nor video publishing is implemented yet.

## Common model

A professional owns product listings. Each listing has a stable ID, seller/professional ID, title, description, publication/moderation status and timestamps. Listing images use owned media assets. A service-product join table and a post-product join table associate products with relevant services and tutorials. Composite foreign keys must enforce that a professional can attach only their own products to their own content.

Public views expose published products only when the professional remains active and published. Private drafts, provider references and commercial account details are excluded. Professional writes derive seller identity from the authenticated account and use database row-level security; caller-supplied seller IDs cannot authorize access. Admin moderation is separate, MFA-protected and audited.

## Option A: links to existing shops

Store a validated HTTPS destination URL. Label the action clearly as visiting the seller's shop, and make the external destination visible. Do not claim glohaus handles stock, shipping, returns or product checkout. Prices are optional indicative display information and must not imply a live stock or price guarantee. Reject non-HTTPS links and embedded credentials; do not fetch arbitrary seller URLs from the server.

This option needs listing management, content attachment, discovery/product detail UI, moderation and link-safety checks. It does not require product orders or payments in glohaus.

## Option B: direct product purchases

Choose and provision a commerce backend before implementing catalogue/cart/checkout against it. The provider must support the chosen multi-seller model; a normal single-store integration is not automatically a marketplace solution. Decide who is seller/merchant of record, who fulfills orders, and who handles support and returns before taking money.

Additional entities include provider-backed product variants, stock references, customer orders, immutable order items, seller suborders, delivery addresses, fulfillment/shipping state, provider payment references, refund requests and event idempotency records. Product orders remain separate from appointment bookings. Never reuse booking cancellation/deposit rules for product returns.

Customer order/address access is owner-only. A seller sees only the fulfillment data for their own suborder, never another seller's customer data or the customer's complete order. Avoid combining sellers into one checkout until split-payment, shipping and refund behavior is explicitly supported. Money uses integer minor units and explicit currency; inventory reservation and webhook processing must be idempotent.

## Tests and launch checks

Test forged seller IDs, cross-seller attachments, private product visibility, suspended sellers, unsafe destinations, duplicate provider events and stale prices/stock. Direct checkout additionally needs concurrent stock reservations, partial fulfillment/refunds, seller-specific address access and provider outage recovery. Do not expose real purchasing until seller obligations, shipping/returns, payment reconciliation and live provider tests are complete.

The user selected direct in-platform purchasing on 15 September 2026. External shop links are not the selected implementation. Seller/fulfilment responsibility remains pending: each professional sells and fulfils their own products, or glohaus is the central seller. No commerce provider is configured. The installed Vercel CLI 59.16.0 refused even category discovery without credentials; account login and provider setup remain required. The commerce skill requires real provider provisioning before catalogue/cart/checkout implementation. Do not mistake appointment Stripe integration for a ready multi-seller product marketplace.

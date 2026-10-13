# Support and Shop collections

Contact Us is available at `/contact`, from the shared footer, the FAQ support answer, the Discover sidebar and the Shop help note. Visitors can submit without signing in. The request is persisted before confirmation and receives a reference. Errors preserve the form. Authorised staff see requests in Owner/Admin → Support inbox, can follow up using the submitted email and mark requests resolved or reopen them. This is a private intake inbox; replies are sent manually from the team's support mailbox, not by this feature.

The intake is limited per email, per server-derived network hash and globally per hour. Raw network addresses are not saved. Browser database roles have no access to the support tables or routines. The web runtime can submit through a constrained function; inbox reads and status updates repeat the existing verified-admin check. Status changes have a separate support audit trail.

Shop's collection links preserve product searches and use explicit collection parameters:

- Bestsellers: units from paid, processing, shipped and delivered GLOHAUS orders, excluding cancelled/refund-pending/refunded orders.
- Trending: the same eligible sales in the last 30 days.
- Deals & offers: a current product price below a seller-entered genuine previous selling price. Professionals can set or clear the optional previous-price field. The database and API reject a comparison price at or below the current price. Prices charged and existing fee/commission rules are unchanged.
- New arrivals: creation date, rather than the date of the most recent edit.

Rankings are applied before the catalogue's 100-product result limit. Buyer identities, addresses and payment records never appear in the public aggregate view. The dedicated aggregation role has access only to the order columns needed to compute product totals. Both new privileged non-login roles are rejected as members of the web login by the existing runtime credential guard.

The FAQ uses the shared site footer. Its marketplace-responsibility paragraph remains. Shop now explains baskets, available checkout options, seller shipping and where to obtain order help; the internal rollout wording is removed.

Validation includes isolated database tests for guest intake, verified staff access, rate limits, audit records, real sales/date/offer filters, hidden products and customer privacy; API request-to-database-to-inbox verification; and desktop/mobile browser coverage for contact links, form error/retry/confirmation, a single FAQ footer and real collection URLs. No live purchase or live customer support message is required for these tests.

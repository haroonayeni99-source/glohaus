# Shop cart error investigation — 13 October 2026

## Evidence

- Vercel recorded one `POST /api/v1/cart` failure at 12 October, 17:40:05.758 UTC on `dpl_75TWzaAWdP5aBZJURvr6QXmGDQxz` (`a19f05bd4c49ac7b21e717540e0daa15b6b7569c`), through its direct deployment hostname.
- The retained request log contains only `Account request failed { type: 'error' }`. It does not identify the database decision, transport error, customer or response body. The exact historical trigger remains unconfirmed.
- The production release at the start of this investigation was `dpl_HDGpGAZzukY1LwxFCPiQCpQGLJoX`, commit `d5e491f931dd5583854078cca8d284423e1dfbad`. Its error/fatal log scan from 13 October, 02:01 UTC returned no records.
- Read-only production checks confirmed cart function execution grants, table read grants and RLS policies for `beauty_cart_ops`. No database permission repair was required.

## Reproduced issue and fix

The cart database deliberately rejects unavailable products, insufficient stock, invalid quantities and self-purchases with SQLSTATE `22023`. Both the older code and current release passed these errors to a generic handler, which logged an outage and returned HTTP 503.

Cart routes now translate only those four exact database decisions into private, uncached HTTP 409 responses. Add-to-cart and quantity controls show specific, actionable messages. Authentication, role checks, same-origin protection and genuine outage responses are preserved.

Unknown cart failures now include the operation and a bounded machine code in the server log. Raw database/provider messages, SQL, request bodies, customer identifiers and credentials are excluded. The shared HTTP helper's existing response behaviour is unchanged; optional diagnostic fields are supplied only by the cart routes.

No customer records, carts, orders, stock, charges, fees, email configuration, website availability settings or obsolete deployments were changed during this investigation.

## Validation

- 730 automated tests passed, including real isolated database rejections and unchanged-cart checks.
- Route checks cover all four decisions, successful reads/writes, authentication, malformed quantities, cross-origin requests, unknown failures and diagnostic privacy.
- Customer component checks cover messages, retrying add-to-cart and retaining items/totals after a rejected quantity update.
- Full lint, TypeScript checking and production build passed before release.
- Existing GitHub browser and journey checks gate the merge and deployment.

The fix addresses the reproduced error-classification issue. It does not establish the exact cause of the historical request or prove a historical site-wide outage.

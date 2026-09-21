# glohaus execution plan

This is the working execution plan for the supplied social marketplace briefs. The product name remains **glohaus**. The supplied URBAN image is visual direction only; its branding and artwork are not reused. The first release remains a responsive web application, with the API and database structured for a later mobile client.

## Implemented foundation

- Guest-accessible discovery feed, search, public profiles, portfolios, service menus, prices, reviews and availability.
- Clerk-ready account identity, PostgreSQL-backed customer/professional/admin roles, RLS and recent-MFA admin checks.
- Professional profile, services, portfolio, posts/tutorials, availability, booking holds, cancellation/refund decisions and reviews.
- Stripe Connect-ready deposit checkout, verified webhook handling and refunds. No payment provider is configured yet.
- Feed scroll snapping, account-backed community likes/saves, share URLs and safe booking return-to-auth continuation.
- Admin moderation, account status controls, labels and refund appeals.

## Delivery order

1. **Professional trust and onboarding** — verification states and reviewed onboarding progress; retain private address/identity data boundaries.
2. **Social graph** — follows, comments, favourites and their private owner-scoped data, then notification events.
3. **Messaging** — conversation membership, message access rules, booking conversation creation and inbox UI.
4. **Content media** — provider-backed video upload/processing, carousels, full-screen post views and visible-video playback controls.
5. **Discovery improvements** — filters for price/rating/availability, grid/list mode and map provider selected after location/privacy decisions are settled.
6. **Dashboard and admin operations** — calendars, customers, richer earnings/reconciliation, verification queue and analytics events.
7. **Commerce marketplace** — separate product/order/seller/fulfilment system only after seller-of-record, shipping, returns and payment-provider configuration are decided.
8. **Provider activation and release checks** — Clerk, PostgreSQL, Stripe, Blob and Resend configuration; real browser journeys, provider webhooks, concurrency and security testing.

## Non-negotiable security rules

- Guests can browse public content without an account. Booking confirmation, payments, messages, follows, likes, comments, saves, reviews and private account areas require an authenticated role.
- Return URLs accept internal paths only. Booking state is rechecked on the server after authentication, before checkout.
- Service price, deposit, availability, booking ownership, refunds and all roles are derived from server-side data.
- Payment cards are handled by Stripe; they never enter the glohaus database.
- Private customer records, messages and professional operational data require explicit participant ownership checks and RLS.

## Current external-service gates

No Clerk, PostgreSQL, Stripe, Blob or Resend resources have been provisioned. Provider-dependent functionality is implemented around environment variables, but cannot be live-tested or released until these services are configured.

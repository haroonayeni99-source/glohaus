# Reference-design page status — 23 September 2026

This is a page-by-page implementation inventory, not a claim that production workflows have all been verified.

## Connected pages

- `/`: vertical discovery and engagement controls; editorial examples are separate from persisted community posts.
- `/explore`: professional/service discovery with categories and search.
- `/p/[slug]`: published professional profile, portfolio, service menu, reviews and booking picker.
- `/sign-up?intent=professional`: Supabase professional account creation and email confirmation.
- `/onboarding?intent=professional`: account enrolment, then `/professional/setup`.
- `/account`: customer identity, bookings, saved looks, reviews, notifications and security navigation.
- `/account/saved`: paginated saved public community posts, protected by identity and existing engagement RLS.
- `/account/reviews`: reviews belonging to the current customer's bookings.
- `/account/bookings`: paginated upcoming/history/all appointment cards with status and London time.
- `/account/bookings/[id]`: protected appointment details and existing status-dependent actions.
- `/professional`: business dashboard using existing persisted metrics.
- `/professional/tools`: business tools and a link back to the public customer experience.
- `/professional/profile`: business details, photo, social/contact details, visibility and an unsaved text preview.
- `/professional/services`: dedicated service editor, active/inactive/all filters, images, prices, duration and deposits.
- `/professional/availability`: monthly calendar, weekly hours, saved time off and breaks; dates use Europe/London.
- `/professional/portfolio`: existing protected image management.
- `/professional/posts`: existing post/tutorial editor.
- `/professional/bookings`, `/professional/clients`, `/professional/reviews`: existing protected database-backed pages.
- `/professional/wallet`: existing financial ledger views; requires provider setup for money movement.
- `/notifications`: existing private in-app notifications.
- `/admin`: existing MFA/owner protected management, moderation, access controls and audit log.

## Remaining work before the full image brief is complete

- Real customer/professional messaging, unread states and conversation notifications.
- Product catalogue, seller management, stock, basket, orders, shipping and marketplace checkout.
- Video hosting/playback, comments, following and richer discovery.
- Profile cover uploads, controlled persisted themes, service reordering and special-day hours.
- Additional admin verification, analytics and notification management.
- Production cross-account and end-to-end booking/payment/upload verification.

## Configuration gates

At the last verified Vercel configuration, `DATABASE_URL` was absent. Account enrolment and every protected database-backed page need the restricted runtime pooler credential documented in SETUP.md. Do not use a privileged database connection. No database migrations, credentials or provider settings were changed in this UI pass.

Portfolio upload requires private media storage. Payment capture and payouts require separate provider activation and testing. The shop intentionally remains a prelaunch page until a real commerce system exists.

## Validation

The automated suite contains 237 passing tests, including calendar tests for London dates, DST, end-exclusive time-off boundaries, overnight intervals and leap years. Lint, type checking and production compilation pass. This does not establish successful live onboarding or transactions while external configuration is missing.

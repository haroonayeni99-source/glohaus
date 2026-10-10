# Mobile visibility and layout audit — 10 October 2026

## Reproduced issues and fixes

| Area | Reproduced symptom | Change |
| --- | --- | --- |
| Shared public navigation | Desktop navigation overrode its mobile hiding rule and pushed links and account controls beyond a 320px screen. Tablet navigation also omitted destinations. | Correct the responsive selector and provide a scrollable, keyboard-accessible Menu with public and account destinations. Signed-out private destinations retain the existing sign-in return path. |
| Professional navigation | Shortcuts and Sign out disappeared on small screens. | Provide a Professional menu with the existing dashboard, booking, client, wallet, product, order, message, notification, posting, customer-view and security destinations. |
| Homepage | Mobile omitted the desktop booking, message and payment summaries, recommended professionals and several service links. | Render the existing summary and professional data on mobile and add links for the remaining service categories, inspiration and Shop. Preserve the existing mobile hero and bottom navigation. |
| Signup | Professional signup option extended beyond a narrow screen. | Allow choice text to wrap within the available width and keep icons intact. |
| Services and public profiles | Long service names pushed Deactivate and Book controls off-screen at 320px. | Wrap management actions and stack public service information and prices on phones. |
| Cart | Long seller names extended beyond the cart column. | Constrain the grid track and wrap seller/product text on phones. |
| Owner/Admin | Overview tabs and verification inputs extended beyond a 320px viewport. | Wrap overview tabs and stack verification form fields within their container. |
| Marketplace | Mobile hid the entire Shop by navigation. | Keep these filters available in the existing horizontally scrollable category rail. |

## Verification method

`scripts/check-mobile-layout.mjs` checks real public Next.js pages and real authenticated components rendered with fictional local fixtures. It checks viewport overflow, individually clipped links/form controls, browser exceptions, mobile homepage content, Shop by visibility, and menu interaction (reachability of every link, Sign out reachability, Escape/focus and outside dismissal). Desktop is included to catch regressions.

The baseline reproduced defects even when the document itself reported no overflow: root clipping concealed controls outside the viewport. The fixes address the content/layout instead of adding another overflow-hiding rule.

Fixture routes include account, dashboard, business tools, profile editing, services, availability, products, orders, bookings, public professional profile, cart, Explore and Owner/Admin. Public routes include home, Explore, Discover, Share, Shop, About, FAQ, How It Works, professional/customer previews, signup and policy pages. Both light/night themes and 320, 390, 768 and 1440px widths are covered.

Authenticated checks use isolated fictional data and mocked requests. They do not impersonate production users or perform production account, financial, publishing or moderation actions. Image responses are placeholders for layout checks. No payment rules, permission checks, secrets or production data are changed.

The existing Owner/Admin navigation and control audit is also extended to 320px, including both roles and both themes. The standard unit, type, lint, build and browser suites provide regression coverage.

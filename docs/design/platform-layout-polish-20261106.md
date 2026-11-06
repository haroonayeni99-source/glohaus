# Platform layout polish — 6 November 2026

Baseline production source: `5f6ffb1cee81a25dae00123d547225e3b0f6c828`. This release builds on the homepage, navigation and one-click theme switch. It is an incremental platform-wide visual pass, not a declaration that every page or physical device has been exhaustively verified.

## Visible changes

- Customer account: wider desktop dashboard with an identity panel, two business-area columns and a full-width settings group. Tablet/mobile progressively stack the groups. Existing links and role-based actions remain.
- Bookings, Shop orders, reviews, saved looks, followed professionals, profile settings and communication settings: reusable gradient page introduction, consistent typography, spacing, wrapping and themed surfaces.
- Appointment navigation, saved/profile lists and empty states: richer card boundaries, clearer selected tabs and consistent calls to action. Existing record rendering and pagination remain.
- Professional dashboard: richer welcome panel, consistent rounded setup/stat/action cards and more deliberate spacing. Existing data, eligibility and plan logic remain.
- Owner/Admin: stronger task introduction, readable quick-action cards and consistent overview card shapes. No admin control, section ID, permission or setting is changed.
- About, How It Works, Contact and FAQ: shared hero typography and themed panel treatment; existing page content, contact workflow and FAQ accordions remain.
- Shop and Discover composition, professional-selected profile styles, booking/checkout forms and one-click appearance behaviour are retained.

## Preservation and verification

No database, payment, authentication, permission, API, environment-variable or business-rule change is included. All data queries and save endpoints remain unchanged. No test creates a real booking or payment.

181 targeted/regression tests passed across 14 files. TypeScript, targeted lint and a complete webpack production build passed. Read-only actual-component previews use synthetic data; no real account information is included in preview screenshots. Browser checks cover customer account and appointment layouts at 320, 390, 820 and 1260 widths, with light/night checks, plus professional dashboard composition. Physical iPhone Safari/Android/PWA tests and independent role-only account checks remain separate verification work.

## Rollback

Preserved branch: `restore/before-platform-layout-20261106`, source `5f6ffb1cee81a25dae00123d547225e3b0f6c828`.
Previous READY production deployment: `dpl_6H1FPUMq9TcvjqbbQEDjXZ2uFQ8N`.

Selectively revert this visual release or roll back that glohaus1 deployment, preserving later unrelated work. Do not reset the database, credentials or payment configuration. Existing earlier restore points remain available.

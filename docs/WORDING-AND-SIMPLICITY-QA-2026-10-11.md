# Wording and simplicity pass — 11 October 2026

Professional setup now describes the next task rather than repeating a generic instruction. The setup page links to the first unfinished step; completion describes the setup checklist, separately from verification. Services show one useful empty-state message for an empty menu, an inactive filter or a search. Working hours and portfolio guidance use plain language and retain the privacy/publication distinction.

Owner/Admin navigation and search consistently use Users, Sign-ups & sign-ins, System health, Payment setup and Email setup. Account setup states avoid provisioning jargon. Booking, review, content, audit and email empty states explain what will appear there. Reporting labels explain sending versus confirmed delivery and distinguish recorded revenue from subscription list value. Payment and email setup check labels are simplified; their keys, required flags and readiness calculations are unchanged.

Sensitive-action warnings and confirmation behaviour are retained. The workspace explains that entries survive section changes but must be saved before leaving the page. No controls, section IDs, routes, layouts or theme styles are removed or replaced.

## Verified display correction

When payment-readiness data is unavailable, System health now shows an unknown count and UNAVAILABLE rather than zero issues and HEALTHY. It links to Payment setup for a retry. Three regression tests cover unavailable, blocked and healthy/optional states. This only corrects the display; it cannot authorise payments or change rules.

## Validation

- Lint, TypeScript and production build passed locally.
- 600 tests across 70 files passed, including the three payment-status regressions; final commit is gated on GitHub CI before merge.
- 16 isolated Owner/Admin browser cases: both roles, light/night, 320/390/820/1440 widths; all available sections, search, confirmation cancellation/acceptance, focused view and menu controls.
- Eight isolated professional/customer journeys: light/night, 320/390/768/1440 widths; setup guidance, service search/editing, hours, portfolio, verification and connected customer actions.
- Browser mutations use fictional fixtures. No production financial actions or account changes were performed.

No payment rules, amounts, secrets, permissions, database schema or production data are changed. After release, verify the exact production deployment commit, public pages, authentication gates and runtime errors.

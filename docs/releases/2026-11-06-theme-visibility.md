# Light/Night visibility repair — 6 November 2026

Baseline 5e2a911e7e1a11357c9eeb078ad3d44b08393a18. Existing glohaus1 project only. No database migrations, payment changes or booking logic changes.

## Reproduced causes

Production Night booking controls had near-white date-number strong elements on white buttons; Select Date/Time legends stayed dark on a dark booking panel. Broad descendant colour rules and hardcoded nested backgrounds disagreed. An older policy-specific compensation explicitly forced a light palette inside the now-dark booking summary. Customer marketing preference rows retained white backgrounds while inherited Night headings/descriptions turned white. Professional Sign out inherited almost the same dark colour as its permanently dark header. The customer authentication story used the theme's canvas as its text colour, making the text dark on its fixed dark background in Night.

## Scoped fixes

A final, component-scoped theme-controls stylesheet pairs surfaces, text, borders, selected states, focus and placeholders through the existing berry/pink semantic tokens. It targets booking, professional availability, shared primary/secondary actions in existing customer/professional/Admin workspaces, marketing rows and fixed-dark header/auth surfaces. It does not recolour every element globally or remove existing theme layers.

- Booking date numbers, weekday labels, legends, times, deposit/service/policy summaries and payment choices now use matched pairs.
- Native date fields inherit the selected colour scheme. Actual native Safari/Android popup rendering still requires physical-device checks.
- Selected controls have a check mark plus an inset outline, with existing aria-pressed retained. Today is underlined and the booking strip gains aria-current/date and a full date label. No date choice, slot generation, availability, timezone, payment or scheduling code changed.
- Disabled booking controls remain readable without opacity fading, with dashed boundaries and unavailable cursor; no new dates are disabled or enabled.
- Colour transitions are removed only from paired action controls, preventing foreground/background mismatch during switching. Other motion and existing reduced-motion behavior remain.
- The old forced-light booking policy compensation uses semantic tokens in both modes.
- Customer marketing descriptions and professional Sign out get matched backgrounds/foregrounds. Authentication story copy remains visible against its intended dark surface.

## Verification and honest limits

42 focused tests across nine actual test files passed, including new palette AA contrast and today semantics checks plus existing theme preference, booking date/payment/policy, professional calendar, connection UI and communication checks. TypeScript, scoped ESLint, secret scan, diff check and final production webpack build checked before publishing. Palette tests require 4.5:1 text and 3:1 meaningful borders/focus.

Browser acceptance uses actual BookingPicker and AvailabilityCalendar with the full stylesheet order and synthetic services/slots, in 390px and 1024px frames. Calendar/control samples measured 68 elements per theme; stable Light minimum 6.26:1 and Night minimum 8.30:1. Night payment-summary and surrounding form scan measured 83 solid-background text samples with minimum 7.04:1 after repairing residual policy/avatar/balance conflicts. The scanner skips gradients, translucent surfaces and opacity; this is scoped measured evidence, not a whole-site WCAG certification. Existing provider data was not used for these synthetic checks and no payment was submitted.

Production baseline professional connection text scan: Night samples passed; Light exposed the fixed Sign out issue. Customer notification settings scan exposed the marketing-card issue in Night. Owner/Admin entry reached the expired fresh-authenticator requirement, so authenticated Owner dashboard states remain unverified in this session; no access rules were weakened. Source/theme coverage and representative controls do not establish every page/state has been manually tested.

Physical iPhone Safari, Android Chrome, installed iOS/Android PWAs, OS-native calendar popup details, every chart/modal and every Owner/Admin state remain pending. Existing preference storage, pre-paint initialization and PWA/browser theme colours are retained. Deployment identity and post-release observed states are reported in the delivery message.

## Rollback

restore/before-theme-visibility-20261106 preserves the baseline. Selectively revert this scoped presentation change or use the prior Vercel deployment, preserving later work and all data. No database or credential rollback is required.

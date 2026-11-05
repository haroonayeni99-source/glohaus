# GLOHAUS visual consistency review — Direction 01

Prepared 5 November 2026. Review branch: `preview/visual-consistency-20261105`.
Production baseline: GitHub main `ae958b7b120a6e3ba08b75945e95110480fa0c16` (local equivalent tree at `d7f6438`). No production changes or deployment.

## Additional direction — preserve visual richness

Haroon explicitly does not want minimalism. Keep Marketplace/Discover gradients, imagery, rich cards, useful density and distinctive typography. Simplify organisation and task flow, without stripping visual character or features. See `feature-consolidation-review.md` for the source-grounded consolidation assessment, desktop/mobile presentation, risks and approval gates. GLOHAUS Together is the planned umbrella for service gifting and group contributions; it is not verified as an existing implemented payment feature. No additional fee or financial behaviour is approved by visual feedback.

## Decision to review

Refine the existing platform using Marketplace and Discover as the quality benchmark. Keep their layouts, image-led discovery, berry/pink accents, rounded cards, hierarchy and richer professional information. Carry those qualities into shared controls and the homepage without changing the platform's identity or business behaviour.

The isolated, responsive preview is in `previews/visual-consistency/dist/index.html`. It demonstrates a direction, not a replacement production application. Example cards are labelled. It does not connect to databases, Stripe, authentication or bookings. Existing GLOHAUS image assets are reused. Makeup/lashes/skin category circles remain explicit text placeholders in this first preview, pending the live-image audit; they are not proposed final imagery.

## Evidence and coverage

All 81 page entry points have been inventoried in `interface-inventory.csv`. The shared layout, theme bootstrap/toggle, header/brand, mobile menu, bottom navigation, PWA shell/store, loaders, homepage components, shop structure, and principal shared stylesheets were inspected directly. Prior authenticated browser work confirms the professional connection/profile layouts. This is a source and supplied-screenshot audit, not an assertion that every protected workflow or physical device has been visually tested.

| Supplied image | What it demonstrates | Preserve / refine |
|---|---|---|
| IMG_5907.jpeg, IMG_5906.jpeg | Marketplace: clear sans wordmark, berry gradient hero, category strip, layered panels and pink actions | Preserve its composition; establish reusable colour, type and spacing rules from it |
| IMG_5908.png | Mobile expanded menu repeats Home, Discover, Bookings, Messages and account destinations above an existing bottom bar | Keep every destination; use secondary groups and role-specific links, with primary tasks in the bottom bar |
| IMG_5905.png | Home serif wordmark, subdued search and install card covering hero content; floating theme pill competes with other controls | Clarify search contrast, align wordmark and move install suggestion into page flow; put theme setting in a menu/settings location |
| IMG_5903.png | Ivory loading screen with tracked rose-gold wordmark and visible small slogan/indicator | Preserve restrained brand presentation; align canvas and wordmark geometry with destination |
| IMG_5904.png | Black loading screen with rose-gold wordmark; slogan/indicator not legible in this capture | Investigate delayed animation plus asset/surface differences, rather than conclude a universal text-colour failure from one frame |

## Root causes found in source

1. **Three wordmark systems.** `brand.tsx` renders text; `globals.css` `.brand` uses Arial with `.12em` tracking. `.mobile-home-brand .brand` overrides it with Georgia and `-.04em` tracking. `loading-screen.tsx` renders two distinct raster assets with different dimensions and cropping transforms. The homepage difference is an explicit CSS override, not just a device font problem.
2. **Several competing colour systems.** Base `--paper` is `#fcfbf9` / `#171415`; splash is `#f5f2ee` / `#000`; `app-theme-colors.ts` uses the base canvas. `design-system.css` introduces green `--ui-accent`, green night surfaces and green focus colours. Other component sheets use hardcoded colours and compatibility overrides. A new override at the bottom of one sheet will not resolve the ownership problem.
3. **Large cascade and separate shells.** `globals.css` has 13,266 lines; compatibility, customer polish, site improvements and design-system files add over 2,000. The root layout imports several of them, plus shared role-specific sheets. Mobile and desktop homes are separate components, with distinct responsive rules. Shared-file changes therefore need an affected-route inventory and route-family checks.
4. **Theme is bootstrapped before content already.** Preserve the existing nonce-bearing head script. It persists Light/Night and uses the OS default when unset. Its storage-error catch forces Light, even on a dark OS. The toggle independently reads/reapplies theme after hydration; consolidate preference resolution and test hydration/system-change behaviour rather than add another theme engine. Add an explicit System setting while retaining the current storage key and existing values.
5. **Loader timing differs from readiness.** The initial introduction holds for 1,900 ms after image readiness (900 ms reduced-motion), with a 1,200 ms asset fallback. The route fallback is different and follows actual suspense. Slogan/indicator reveal animations start after 800 ms. Never present the looping indicator as measured progress. Preserve fallback escape and existing reduced-motion support; propose removal of the artificial hold only as an explicitly approved usability change.
6. **Install prompt is eligible immediately.** `PwaShell` checks route/device/install/dismissal conditions but has no engagement delay. The notice uses fixed positioning above the bottom bar. The store already respects a 90-day dismissal: retain it. This is timing/placement, not a missing-dismissal implementation.
7. **Navigation duplicates are data-driven.** `MobileSiteMenu` contains primary and account links that overlap `BottomNavigation`. Preserve protected `returnTo` URLs and `canAccessAdmin` checks. Professional menus are a separate list; do not silently deduplicate against the customer bottom bar where the role has a different navigation context.
8. **Category labels and imagery can be configured independently.** `homepage-images.ts` uses stable slot keys and independent image/name overrides with Unsplash fallbacks. A renamed label can retain an old image. The screenshot alone does not prove every category is wrong. Verify each visible configured category/asset pair; recommend a paired owner preview/alt-text check without changing stored taxonomy or professional data.

## Proposed shared standards

Use semantic tokens with one owner; preview names are `--gh-*`. Do not globally import them until approved and tested. Migrate existing aliases progressively per component family instead of replacing all historical CSS at once.

| Token | Light | Night | Purpose |
|---|---|---|---|
| Canvas | #fcfbf9 | #171415 | Page, splash and supported browser presentation |
| Surface | #ffffff | #231d1f | Cards, menus, inputs |
| Elevated | #f5eeee | #30272c | Nested panels and secondary surfaces |
| Text | #241e21 | #f7efeb | Primary content |
| Muted | #6c5c64 | #c7b9c0 | Descriptions and metadata |
| Border | #d8c9cf | #69555f | Dividers/surface boundaries; input outlines need separate 3:1 verification |
| Control outline | #927d87 | #a08895 | Separate stronger boundary for input controls |
| Brand action | #a82962 | #f19cbd | High-contrast filled actions |
| On brand | #ffffff | #30121f | Filled-action labels |
| Soft accent | #fce7f0 | #432535 | Selected/secondary accents |
| Rose gold | #855247 | #e0a594 | Loading and brand detail |
| Success / danger | #246348 / #a1273e | #97dab9 / #ffb0bd | Status; never rely on colour alone |

Keep DM Sans for reading and controls and Manrope for strong headings, as already declared by the platform. Prefer self-hosting the exact approved fonts to remove remote `@import` timing variability; preserve a robust sans fallback. The preview uses local sans fallbacks and does not download a new typeface. Proposed brand direction uses Marketplace's tracked sans treatment consistently; actual logo artwork remains unchanged pending Haroon's approval. No new crown use: keep the existing professional-only condition.

Type: body 16 px / 1.55; secondary 13–14 px; labels 14 px; headings responsive 30–50 px, section heading 23–26 px. Use 4/8/12/16/24/32/48 px spacing. Controls minimum 44 px, preferably 48 px for primary mobile input/actions. Radius: control 12 px, card 20 px, hero 24 px. Use a subtle surface shadow rather than borders, gradients and shadows all competing at once. Use existing Lucide icons consistently at 18–22 px, retaining meaningful accessible names and hiding decorative glyphs.

Calculated text contrasts against the specified backgrounds: light body 15.83:1; light muted on white 6.26:1; light primary label 6.65:1; night body 16.13:1; night muted 8.78:1; night primary label 8.30:1. Recalculate during implementation for actual surface combinations, disabled controls, photography, gradients and focus outlines; these are token checks, not a complete accessibility certification.

## Screen proposals

### Homepage

Preserve search, categories, hero imagery and discovery sections. Align the header wordmark with Marketplace, make the search field clearly bounded and readable in both themes, and use consistent gaps/card radii. Maintain independent desktop/mobile compositions: keep the existing desktop rails rather than replacing the entire production home with the illustrative preview's simplified layout. Existing rich professional cards, verified information and service prices must stay intact. Confirm category photos actually show their labelled services; no mass asset replacement.

### Navigation

Keep the existing customer bottom bar: Home, Discover, Bookings, Messages, Profile. Put Find a Professional, Shop and Share prominently in the mobile secondary menu. Group wallet/payments, orders/cart, notifications and security under Account; put About/FAQ/how-it-works/contact under Help & GLOHAUS. Move theme preference (Light/Night/System) into the menu and relevant settings, with a discoverable desktop location. Keep sign-in/sign-up accessible for guests, sign-out for authenticated users, and current Owner/Admin entry points for authorised users. Keep professional booking/client/wallet/business controls in their own workspace. Do not introduce a permanent focus-trapping menu unless it is implemented/tested as a modal; the existing details disclosure supports Escape and outside close.

### Loading and themes

Use exactly the same semantic canvas for splash and destination; reserve rose-gold for the lockup/slogan/indeterminate indicator. Align lockup bounding boxes and tracking between modes. Prefer a single approved transparent asset or one shared brand component with supported colour variants after approval, not two arbitrarily cropped images. Render the slogan legibly from the beginning. Resolve explicit preference before first paint; respect OS when unset or storage is blocked; retain preferences across route changes and follow OS changes only in System mode. Use correct `color-scheme` and supported meta theme colour. iOS status-bar behaviour has platform limits; do not promise dynamic control where Safari does not support it. No animations when reduced motion is selected.

### Interruptions

Replace unsolicited fixed installation overlays with a compact in-flow suggestion after meaningful engagement (e.g. after a second page view and 30 seconds, never during form completion). Existing /install remains directly accessible. Retain 90-day dismissal, install/standalone detection and service-worker update handling. Keep update notices separate: do not auto-reload unsaved work. In the preview the install card is always visible solely to review its proposed placement. Its dismissal is demonstration-only.

### Wider interfaces

| Family | Preserve | Presentation work after approval |
|---|---|---|
| Discover / professional profiles | Rich info hierarchy, images, filters, badges, service links, ownership | Surface/type alignment, image ratios, filters on small screens, readable metadata |
| Booking / checkout / wallet | All totals, fees, deposits, consent, Stripe flows and permissions | Read-only fixture review of field contrast, summaries, errors, keyboard and safe-area overlap; no live charges |
| Customer accounts / messages | Task routes, real-time states, privacy, message actions | Consistent form controls, conversation density, empty/error/loading states |
| Professional / Business Hub | Workflow order, services, calendar, connection controls and eligibility | Shared card/form treatments; advanced sections behind accessible disclosures where justified |
| Owner/Admin | Every control, access checks, audit trail and workflow | Grouping and legibility; preserve high-density tables with usable horizontal scroll, accessible row actions |
| Auth / onboarding / policies | Return routes, verification, eligibility, content and consent | Typography, labels, focus, errors and consistent shell |

## Staged implementation and approval gates

1. **Now — evidence and isolated direction.** Inventory source, map screenshots, identify root causes, deliver responsive preview/token file. No app imports or production changes. Additional screenshots/observations append to this same brief with dated findings.
2. **After direction approval — foundations.** Shared theme resolver and preference tests; brand choice; semantic tokens behind a review flag/scoped wrapper; migrate loader and supported browser colours. Test head-script/CSP, storage exceptions, hydration, navigation and reduced motion. No broad CSS deletion.
3. **Then — homepage/navigation/overlays.** Implement approved responsive refinements, menu grouping and non-obstructive installation guidance. Explicit usability changes: menu grouping, theme-control relocation/System option, install timing/placement and any removal of artificial loader delay. Preserve routes and role-specific entry points.
4. **Then — route families.** Professional profiles and Customer/Business Hub, then protected booking/checkout, messaging and Admin. Use existing components with local semantic styles, not cloned business logic. Approve each batch against preserved screenshots.
5. **Release only after approval and evidence.** Review preview diff, targeted interaction/route/theme checks, real-device/PWA matrix and rollback plan. Deploy solely to `haroon-glohaus/glohaus1` when explicitly approved. No schema or payment changes in cosmetic work.

## Verification matrix and honest limits

| Platform/state | Preview evidence in this batch | Required before release |
|---|---|---|
| Desktop Chromium | Isolated preview rendered; theme/screen controls inspected | All affected live route families; keyboard and zoom |
| Mobile 320/390 + tablet 820 canvases | Container-responsive preview checks | Real viewport tests including 375/430/768/1024 and both orientations |
| iPhone Safari / installed iOS PWA | Supplied screenshots show current issues | Physical-device first paint, safe areas, keyboard, back navigation, theme and install dismissal |
| Android Chrome / installed Android PWA | Not physically tested | System bars/theme metadata, installed state, keyboard and updates |
| Light / Night / System | Preview controls and token contrast | Actual pre-paint/hydration/reload/navigation/storage-failure tests |
| Reduced motion / assistive tech | Preview CSS disables motion | Actual OS setting, focus order, screen reader and 200% zoom |
| Financial/data safety | Preview has no network/backend calls | Diff must remain cosmetic; fixture regression and approved release validation |

Do not label this first source audit as a completed physical-device or every-workflow acceptance test. The preview's interactive controls demonstrate the proposal; they do not perform real sign-in, search, booking, admin or install actions.

## Review build verification

- JavaScript syntax check passed; HTML IDs are unique and all images have alt attributes.
- Chromium DOM checks: 320 px canvas has 318 px content/318 px scroll width; 390 px has 388/388; 820 px has 818/818. Borders account for the remaining 2 px. The document had no horizontal overflow in the checked canvases.
- Existing embedded hair/nails/hero assets loaded successfully. Theme and menu selection controls were exercised. Desktop light and mobile night proof images were captured.
- These files are isolated: no `src/`, database, payment or role files were changed. The sole Vercel configuration change disables automatic builds of this review branch; the main/production configuration is preserved.

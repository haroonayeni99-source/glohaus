# Initial entrance and navigation loading release

Production baseline: 8a1ef36011ae0a1e6a76188e27d9596142e0235b (glohaus1). Restore point: restore/before-entry-loading-20261106. Restore selectively; preserve later unrelated changes. No database migration, environment change, payment/auth permission rule change or analytics activation.

## Audit and cause

The earlier visual refinement made .glohaus-intro display:none unless the body contained a pending-route marker. Its effect immediately unmounted the entrance on an already-ready document. It also removed the approved 1900ms introductory pause and replaced both image wordmarks with text. As a result a cached/quick initial page could show no branded entrance at all. Normal SPA navigation was correctly separated from entry and must remain separate.

The root layout awaited public labels and session presentation before returning any body. A route loading.tsx below that layout could not cover this await, so a slow lookup could delay both page and initial branding. Public page links already use Next Link and prefetching; no blanket forced reload or animation delay has been added to those links.

## Changes

- Restore the approved artwork/palette/animations from dcff5ea: original light and night PNGs, warm ivory #f5f2ee, black #000 night background, rose-gold ink, wordmark reveal, reflection, slogan/progress timing and 250ms exit fade. Existing artwork files are reused unchanged.
- Entrance is visible in server HTML even when route data is already ready. It runs once per root document mount, including a cold PWA document launch. A warm app resume/back-forward cache restore does not replay it.
- Retain the approved 1900ms hold after artwork readiness (1200ms bounded asset fallback). Reduced motion uses 900ms and no exit animation. Wait for real initial route readiness if it takes longer. Keep the six-second escape hatch and noscript handling so a failed asset/data request or failed hydration cannot trap visitors.
- Move session/labels presentation into its own async Suspense boundary. Send the theme/bootstrap and entrance independently of those lookups. Session verification itself and protected page/API authorization are unchanged; no user-specific content is cached or guessed.
- Add data-free route loading boundaries for Discover, Shop, professional profiles, service selection and account pages; root fallback also uses the same local component. Includes existing shared header/mobile navigation, static theme-aware skeletons, live status and aria-busy. No full-screen brand animation on SPA transitions; reduced-motion users receive static placeholders.
- Preserve finished layouts, Discover snapping/sidebar/footer behaviour, homepage search alignment, theme toggle position and one-click operation, and the deployed analytics controls. Analytics remains gated off as before.

## Verification and limits

Targeted lifecycle tests cover ready initial document, artwork, original hold/fade, actual route readiness, repeat navigation, night/reduced motion, image failure and stalled requests. Shared loading tests check safe navigation and private-data-free placeholders; regressions include theme, home navigation, Discover footer, Owner sign-in and analytics consent/Owner access. TypeScript and production webpack build passed. Native img tags intentionally reuse the exact original artwork; standard Next image optimisation lint recommendations are advisory only.

Visual checks use actual components in isolated cloud Chrome at narrow mobile and desktop/tablet widths, both themes, without customer data. Physical iPhone Safari, Android Chrome and installed iOS/Android PWAs cannot be claimed verified by those checks. Do not promise a universal instantaneous response: server/network/data time still varies. The release removes an avoidable root-shell wait and uses prefetched route boundaries to avoid a blank transition, rather than changing financial/data fetching semantics.

References: https://nextjs.org/docs/app/getting-started/fetching-data and https://nextjs.org/docs/app/api-reference/file-conventions/loading . Layout-level asynchronous work needs its own Suspense boundary; loading.js enables prefetched local fallbacks and interruptible navigation.

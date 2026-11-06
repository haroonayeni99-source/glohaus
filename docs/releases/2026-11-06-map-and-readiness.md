# Map fallback and activation readiness — 6 November 2026

Baseline: a214c00605bd445f49b908525479356843bd68fc. Target: existing haroon-glohaus/glohaus1 only.

## Scoped release

Reuse the existing GeographicMap renderer if the primary WebGL renderer fails. Consent remains required before requesting third-party map tiles. Standard-map zoom, pan, reset, pin selection, highlighting and viewport callbacks remain available. The enhanced WebGL path remains in place. No financial, account, schema or credential changes.

89 focused tests across 17 files passed, covering map fallback, location, PWA, auth/recovery and analytics. TypeScript, scoped ESLint and production webpack build passed. Browser acceptance using the actual components with synthetic public pins confirmed loaded OpenStreetMap tiles, zoom 10 to 11, changed longitude after pan, reset to initial viewport and selected-pin state. This verifies the standard renderer, not physical touch/pinch or native WebGL graphics.

## Email evidence

The glohaus.shop sending domain is verified. Provider metrics for 31 October–6 November showed one delivered send, no failures/bounces/complaints. Historical registration confirmation delivery was observed in metadata. This small sample does not establish universal deliverability, inbox placement, link acceptance or a fresh recovery delivery. No new messages or password changes were initiated; never reuse arbitrary historical recipients for testing.

## Analytics gates

Production collection remains disabled and analytics storage absent. Final staging retention/bounds update confirmation expired; do not treat it as applied. Owner Supabase sign-in is required to verify a restorable production backup. Reconcile migration ledgers, apply and validate the final staging SQL, establish retention health/alerting, then perform consent/withdrawal/conversion acceptance before production enablement. No production DDL or flag activation in this release.

## Physical-device acceptance checklist — pending

Run separately on an actual iPhone Safari/Home Screen PWA and Android Chrome/installed PWA; record device/OS/browser and result, not just emulation.

- Install from the real production site; confirm icon, standalone launch, safe areas and navigation.
- Cold-launch in light and night themes; approved branded entrance appears once and flows into content without theme flash. Test saved choice and system preference separately.
- Navigate Home, Discover, Shop, public profile and own account: no full entrance replay, no blank layout, readable controls and keyboard-safe fields.
- Check map permission gate, loaded tiles, touch pan/pinch, reset and pin/card selection. Test enhanced graphics where supported and standard fallback where unavailable.
- Go offline: show static offline help; no cached customer/account/payment responses. Reconnect and confirm session/navigation recover.
- Verify reduced motion and accessibility text scaling. Test push only on the Owner's controlled device after explicit permission; do not message customers.

PWA source/tests verify static-only cache policy, offline handling, manifest/icon configuration and install UI. Actual device installation, delivery and gestures are not certified by these checks.

## Recovery acceptance — pending

Use a confirmed Owner-controlled auth test mailbox. Request one reset, verify provider delivery plus inbox receipt and canonical callback, without exposing token links in reports. The user must complete any credential change themselves. Inspect configured Supabase SMTP/callback settings after authorised sign-in.

## Rollback

Restore branch restore/before-standard-map-20261106 retains the baseline. Revert only the scoped application change or restore the prior Vercel deployment; do not reset databases or credentials. Later independent work must be preserved.

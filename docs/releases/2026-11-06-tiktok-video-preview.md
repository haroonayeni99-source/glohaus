# TikTok linked-video preview — 6 November 2026

Baseline: 9a2ee960272eeb41b77d6ec0dd72e7af3aec5ba8. Target: existing haroon-glohaus/glohaus1 only.

## Findings

The inspected authorised TikTok record is source-available and Published, but has no stored cover image. Its professional profile is still Draft and has no public slug. The connection is Connected with no recorded sync error. The application stores metadata and an original TikTok source link, not a copied MP4 file or a saved embed URL. A canonical supported player URL can be derived from the validated source video ID.

Management rendered the link, date and publication controls but no preview/player. Uploaded portfolio files and linked social posts are different existing tables; the uploads-only count of zero did not mean the linked record was missing. Public SocialPortfolio already had an opt-in TikTok iframe; it now shares the same observable player component with management.

Official sources checked: https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list (public-video listing uses video.list); https://developers.tiktok.com/docs/en/embed-player (canonical player/v1/postID, controls, non-autoplay and origin-bound readiness/playback/error messages). Existing OAuth requests user.info.basic and video.list. No new permissions, app recreation or token disclosure is required for this presentation repair. A working sandbox connection does not establish approval for general production automatic syncing.

## Implementation

- Social management has an obvious TikTok preview area, an honest missing-cover placeholder, a user-triggered Load TikTok player button and the original link.
- No TikTok iframe is mounted until the visitor chooses to load it. No autoplay. The same player is used on eligible public portfolios.
- Readiness/playback/error messages require both the exact TikTok origin and the current iframe's contentWindow. An iframe load event alone is never treated as successful playback. No readiness message after 15 seconds produces an explicit unconfirmed notice with an original-link fallback. Unavailable source posts cannot mount a player.
- A separate authenticated thumbnail route serves only the owning professional's source-available draft/hidden/public covers, with private/no-store headers, server-side host validation, bounded transport and sanitised image bytes. The public thumbnail visibility route is unchanged.
- Portfolio distinguishes uploaded files from linked social posts and shows separate status counts plus a link to the existing preview/editor. No videos are copied or duplicated to inflate the upload count.
- Existing Draft/Published/Hidden controls, connection, automatic-sync choices and profile-publication gates are preserved. The inspected post's Published status and profile's Draft status were not changed for testing.

## Verification

61 tests across six files passed: new preview lifecycle/origin/source/error/timeout/URL tests; native PostgreSQL/PGlite draft/hidden cover isolation and image sanitisation; existing social import/status/public-visibility/role tests, connection controls, sandbox and disconnect tests, and business-tools tests. Other professionals receive no draft/hidden cover; customer/Admin roles are denied and no external image fetch occurs for those denials.

TypeScript, scoped ESLint and production webpack build passed. Actual preview component checked in 390px light and 1024px night frames with synthetic links; mobile had no document overflow and a 52px load-button touch target. No third-party iframe existed before explicit loading. This is responsive browser evidence, not physical installed-PWA certification.

Provider playback for the authorised post must be observed after deployment and is reported separately. A player-ready event, a thumbnail or imported metadata alone is not proof of advancing video playback. Physical iPhone Safari, Android Chrome and installed-PWA playback remain pending. If TikTok blocks this browser/domain or rejects this video, keep the visible fallback and report that limitation rather than promise playback or bypass provider controls.

## Protected scope and rollback

No migrations, credentials, connection recreation, privacy-mode changes, customer records, payment rules, Stripe configuration or booking logic changed. Restore branch restore/before-tiktok-video-preview-20261106 retains the baseline. Selective source/Vercel rollback needs no database reset.

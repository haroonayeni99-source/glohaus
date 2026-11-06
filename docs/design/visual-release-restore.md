# GLOHAUS visual release — restore point

User approved implementation/deployment and explicitly requested the ability to return to the previous appearance.

## Exact pre-change version

- Project: **haroon-glohaus/glohaus1**, ID `prj_dHz5OLhAjygs8hOKi99cgtGScgba`
- Production domains: `https://www.glohaus.shop`, `https://glohaus.shop`
- Pre-change source: `ae958b7b120a6e3ba08b75945e95110480fa0c16`
- Preserved GitHub branch: `restore/before-visual-release-20261105`
- Previous READY production deployment: `dpl_AAENj2UNUjhhCtvWggFoK6zjN2QE`
- Immutable deployment hostname: `glohaus1-e8hey69fh-haroon-glohaus.vercel.app`

No database migrations, record updates, pricing changes, account permission changes or environment-variable changes are part of this release. A restore must not restore an old database or reset payment/integration credentials.

## How to restore

Haroon can request: **“Restore the GLOHAUS design from before the visual release.”**

1. Verify that the above deployment belongs to glohaus1 and is still the intended restore point; inspect any later functional releases before acting.
2. In Vercel's glohaus1 Deployments view, select the previous READY production deployment and use **Instant Rollback** (or the supported rollback API/CLI for that same deployment).
3. Verify the production domains and the old appearance. Do not assume a control-plane success alone proves the domain is serving the desired version.
4. Align GitHub main with a reviewed **revert commit** so a future automatic deployment cannot silently reapply the visual changes. Preserve any subsequent unrelated code. Do not force-reset or overwrite later functional fixes.
5. Vercel rollback may disable automatic production assignment; inspect project state and deliberately restore the intended promotion flow after the source is aligned.

If the deployment is no longer available, prepare a new build using the preserved source branch or a selective revert. Do not delete the restore branch without Haroon's approval.

## Included visual/usability changes

- Root entry branding becomes conditional on initial pending content; no timed introduction or normal navigation replay. Local route feedback remains.
- Shared wordmark typography, destination-matched loading backgrounds and immediate slogan visibility.
- Light/Night/System appearance settings in menus and the page footer, replacing the obstructive floating toggle. Explicit choice survives navigation/reload; device preference works when storage is blocked.
- Shared form/focus colours follow the berry/ivory/charcoal family. Existing rich page layouts and photography remain.
- Mobile duplicate primary links hide only where the visible customer bottom bar provides them (<=600 px). Help is grouped; existing Owner access checks are unchanged.
- Shop header Cart entry preserves the existing cart and guest return destination.
- One customer Bookings entry retains Upcoming/History/All tabs. Account and professional tools are grouped around existing links; no routes are retired.
- Installation guidance is delayed 30 seconds and kept in page flow, retaining 90-day dismissal. Updates remain explicit and do not automatically reload unsaved work.

GLOHAUS Together monetary gifting/group funding, new fees, reward activation and production social-sync approval are **not** activated by this visual release.

## Homepage polish follow-up — 6 November 2026

- Restore branch for the first visual release: `restore/before-homepage-polish-20261106`.
- Source: `72eb8d9f3838002a2486b1f4646e019931a3d47a`.
- READY production deployment: `dpl_9fue9zFE2Hswcc91jwur7LdPhEhV`.
- Floating appearance control restored at Haroon's request; Light, Night and Use device setting remain available. Menu settings remain available too. This supersedes the footer relocation above.
- Homepage-only richer hero treatment, stronger typography, clearer search, category rings and booking-guide/inspiration card polish. Existing images, links and workflow logic retained.
- No financial, data, auth, permission or integration configuration changes.

Both restore points remain available. A request to undo only this follow-up should preserve the first visual release; a request for the original appearance uses the pre-visual restore branch above.

Category audit: corrected default mobile Hair image to the existing hair asset and replaced an unrelated landscape in the Lashes fallback with an explicit lash illustration. Owner-selected category images still take precedence.

## Navigation and communications follow-up — 6 November 2026

Before this release: source `a753612d63fc7eac0350223370fadfc9dc5cd897`, preserved branch `restore/before-navigation-organisation-20261106`, production deployment `dpl_FJAYHxhP9o6o9wkrHR7KMbicRoWV`. Revert only the navigation follow-up to retain the homepage polish and restored floating theme control. Follow the selective-revert/rollback procedure above; never reset the database, permissions or credentials.

## Platform layout polish — 6 November 2026

Restore point: `restore/before-platform-layout-20261106`, source `5f6ffb1cee81a25dae00123d547225e3b0f6c828`, production deployment `dpl_6H1FPUMq9TcvjqbbQEDjXZ2uFQ8N`. Reverting only this pass preserves the direct one-click Light/Night switch and previous navigation/homepage work. See `platform-layout-polish-20261106.md` for scope. Use the existing selective restore procedure; no database restore is required.

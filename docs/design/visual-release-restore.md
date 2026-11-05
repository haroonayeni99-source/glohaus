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

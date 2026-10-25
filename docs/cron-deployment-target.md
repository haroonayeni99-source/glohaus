# Production deployment and cron schedules

Verified on 25 October 2026 through Vercel project/domain and Git deployment context:

- Production is `glohaus1` (`prj_dHz5OLhAjygs8hOKi99cgtGScgba`) on the Pro team `haroon-glohaus` (`team_bt39lAKNGwFdn1g6Lynl2MrT`). Both `www.glohaus.shop` and `glohaus.shop` point here. This project is linked to `haroonayeni99-source/glohaus`.
- The older `glohaus-app` (`prj_IwqbTRAA8RF3yZqiAntGtrb3foNS`) belongs to the Hobby team `glo-haus` (`team_xulBQjtk4yTw4D6Vqlbw8Zja`). That team currently has no linked Git projects. Its earlier failed deployments do not describe the production deployment status.

Hobby supports cron execution only once per day. The existing hourly maintenance and every-minute notifications schedules require Pro. Keep both schedules in `vercel.json`; reducing them would delay existing background work. Do not reconnect the repository to the old Hobby project or disable main-branch deployment globally to suppress its historical error.

The approved desktop MUA shortcut, linking to `/explore?category=Makeup`, first reached production in commit `f56261876577a17b11e2abaaa683bcda6001abea`, deployment `dpl_H3jeKPhi88RsJUZd4VrQwH3NAQcv`. The regression script now checks MUA instead of the removed Waxing thumbnail while retaining both themes and mobile layout checks.

Before deployment, confirm the team, project, source commit and domain assignments. Require relevant CI checks and a READY production deployment. For rollback, select the previous known-good deployment within `glohaus1`; do not move domains to the Hobby project. No scheduler, payment, pricing or database changes are needed for this release.

References: https://vercel.com/docs/cron-jobs/usage-and-pricing and https://vercel.com/docs/cron-jobs/manage-cron-jobs

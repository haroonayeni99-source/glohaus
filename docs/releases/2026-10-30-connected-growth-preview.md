# Connected professional-growth preview

Combine the previously verified Referral Foundation, Founding-expiry Owner notices and isolated preview Auth guard with Business Hub reporting, consenting imports, academy cohorts, opt-in rebooking, service/style/needs discovery and signed service/product selections. Retain the unified referral dashboard, current approved main-branch changes and map-test correction. All changes target the existing glohaus1 project; the preview branch is configured only for the isolated validation database.

Verified on this combined source:
- Full Vitest suite: 1,722 passed; four skipped; 206 files passed. Skips are not counted as passing native checks.
- Referral-focused subset: 55 passed; two skipped.
- First combined subset: 110 passed; one skipped.
- TypeScript and clean production build passed. Two earlier concurrent builds were killed by the workspace memory limit; the subsequent sequential clean build passed.
- Node.js security floor passed (24.22.1).
- New import, academy and rebooking schema/functions were applied and smoke-tested only on isolated hosted staging in rolled-back synthetic fixtures. No actual email was sent and rebooking remains disabled.

Hosted authenticated screen checks remain pending user-controlled test-account sign-in. The integration preview is not a production release or permission to launch rewards. Production database migrations remain blocked by the required verified restorable backup. The Supabase dashboard was checked and confirms the Free plan has no project backups; no privileged operator connection is configured in the workspace. No subscription, password reset or production database mutation was used to bypass this gate.

The bundle stage connects separate service and product purchases at current prices. It does not implement combined checkout or a discount. Advanced paid subscriptions and AI assistance remain deferred.

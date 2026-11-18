# GLOHAUS — Independent Implementation & Owner-Assistance Work Order

**Date:** 18 November 2026
**Project:** GLOHAUS
**Production:** https://www.glohaus.shop
**GitHub:** `haroonayeni99-source/glohaus`
**Vercel:** `haroon-glohaus/glohaus1`

**Authorisation:** Continue under my existing implementation, testing, merging and deployment authorisation, subject to the safety and verification requirements below.

Do not use the old `glohaus-app` project.

## Core Objective

Complete as much outstanding GLOHAUS development as possible without requiring my involvement.

From now on, maintain two separate, persistent task registers:

1. **INDEPENDENT WORK — ChatGPT Can Complete**
2. **OWNER ACTION REQUIRED — Haroon Must Assist**

Do not allow tasks requiring Owner assistance to delay unrelated technical work.

If a task becomes blocked, document the blocker, move it into the appropriate queue and continue with another independent task.

---

## PHASE 1 — Immediate Development Priorities

### A. Our Work — Concept C Hybrid Reels Grid and Collections

Continue from existing PR #242. Preserve the agreed Concept C design.

Requirements:

- Three-column, vertical 9:16 reels-style presentation.
- Combine published professional uploads and eligible published Instagram/TikTok content.
- Preserve treatment/service collections.
- Full-screen viewing with swipe navigation.
- Maintain video playback, sound controls and mobile compatibility.
- Allow professionals to feature and organise work.
- Show relevant service-booking links when an actual service is associated with the content.
- Keep drafts and hidden content private.
- Preserve professional verification and existing access permissions.
- Do not redesign Discover or remove its preferred vertical scrolling.

**Technical actions:**

1. Fix the isolated Preview PostgreSQL authentication error (`28P01`).
2. Restore genuine signed-in Preview acceptance.
3. Validate mobile/desktop and light/dark mode.
4. Check filtering, navigation, playback, service associations, accessibility and performance.
5. Review and implement any remaining agreed Concept C requirements not covered by PR #242.
6. Merge and deploy only once all release gates pass.
7. Verify the production result.

### B. Display-Picture Upload Improvements

Continue from PR #240.

Requirements:

- Improve upload speed for customers and professionals.
- Optimise photos before upload without unnecessarily reducing quality.
- Support common image formats and compatible mobile photo formats.
- Enlarge professional profile pictures responsively.
- Improve portrait cropping and logo fit.
- Show meaningful upload progress.
- Replace excessively long loading states with accurate feedback.
- Show clear errors and allow retry without losing the selected photo.
- Prevent duplicate submissions.
- Preserve image security, sanitation, privacy and existing permissions.

**Technical actions:**

- Configure isolated non-production Blob storage for Preview where available.
- Complete current CI and Preview checks.
- Test permitted image formats, file sizes, retries and failures.
- Verify real image-upload functionality rather than relying solely on mocked tests.
- Perform mobile browser and performance checks.
- Complete release preparation and deploy after verification and any PR-specific release approval requirement has been reconciled.

Never reuse production storage credentials or customer files in Preview.

### C. Unified Portfolio Management

Continue from PR #233.

Create one clear professional portfolio management area containing:

- Photo/video uploads.
- Imported Instagram posts and Reels.
- Imported TikTok videos.
- Manual social portfolio links.
- Draft, published and hidden content.
- Featured work and collection organisation.
- Clear editing, removal and publication controls.
- Accessible loading and error states.

Integrate with Concept C without creating competing management interfaces.

Preserve existing social privacy, publication permissions and calendar functionality.

Complete signed-in testing, resolve integration conflicts, verify production compatibility and deploy after all release requirements pass.

---

## PHASE 2 — Owner/Admin and Platform UX

Audit existing functionality before implementing anything new. Reuse working features and avoid duplicate systems.

### Owner/Admin

Complete or improve:

- Detailed analytics for page views, unique visitors, engagement and conversion funnels.
- Professional and customer account management.
- Role-based admin permissions.
- Identity, business and professional verification controls.
- Commission overrides and appropriate financial controls.
- Support inbox, account moderation and audit logs.
- Referral and ambassador oversight.
- Founding Professional management.
- Booking and cancellation visibility.
- Notification management.
- Operational health and Quality Control.
- Dashboard visibility of live, undeployed, partial, missing and blocked features.

Maintain strict role permissions, MFA where required, UK privacy compliance and auditability.

Do not change financial rates or enable financial rewards under this work order.

### UX and Functional Improvements

Complete outstanding work across:

- Light/dark mode readability.
- Mobile and tablet layouts.
- Loading responsiveness, including the agreed subtle three-pink-dot approach where appropriate.
- Profile and portfolio performance.
- Navigation simplification.
- Shop and marketplace functionality.
- Advanced professional search and filters.
- Saved content and favourites.
- Discover functionality while preserving its current preferred design.
- Professional profile usability.
- PWA installation and mobile behaviour.
- Booking interfaces without altering commercial policies.
- Notifications and account settings.

Do not undertake unnecessary redesigns of working areas.

---

## PHASE 3 — Professional Rebooking

Continue the existing rebooking work, including PRs #201, #207 and associated corrections.

Complete independently wherever possible:

- Professional-level opt-in/out and pause controls.
- Named-professional customer consent.
- Service-specific reminder intervals.
- Duplicate prevention.
- Quiet hours and unsubscribe protection.
- Completed-booking eligibility.
- Refund/dispute exclusions.
- Owner controls and emergency stop.
- Delivery failure handling.
- Tests, security and privacy checks.

Keep real automatic sending disabled until the system has passed all release gates and operational prerequisites.

Do not introduce new charges, subscriptions or commissions.

---

## PHASE 4 — Social and Calendar Integrations

### Instagram

The integration is partially live but public OAuth access is not confirmed.

Independently:

- Audit existing code and production configuration.
- Verify the required minimum permission scope.
- Prepare any remaining review evidence, documentation and demo instructions.
- Correct application-side issues.
- Preserve the current allowlist and private-import safeguards.

**Owner assistance:** Meta developer dashboard actions, approval status, provider-required authentication and genuine account consent.

Do not enable public Instagram connections until the required review and live acceptance are complete.

### TikTok

Independently:

- Review the already implemented connection and import functionality.
- Verify the distinction between test access and public production access.
- Prepare remaining provider-review materials.
- Fix application-side issues.
- Preserve existing private-draft publication controls.

**Owner assistance:** TikTok developer access, required provider submission, approval verification or account authentication.

### Calendar Integrations

Proceed only with work that requires no new interactive account sign-in, provider approval or Owner intervention.

Allowed:

- Apple ICS download and subscription-feed development.
- Calendar interface improvements.
- Mocked Google/Outlook integration tests.
- Error handling and connection-state improvements.
- Booking/calendar regression testing.
- Documentation and readiness preparation.

Defer:

- Google OAuth account configuration.
- Microsoft Entra/Outlook OAuth setup requiring login.
- Provider consent or approval processes.
- Any other external account authentication.

Record deferred actions in the Owner queue.

---

## PHASE 5 — Environment and Release Readiness

The isolated Preview environment must be restored as a priority.

Actions:

1. Audit Preview authentication/database configuration.
2. Investigate PostgreSQL `28P01`.
3. Validate the isolated backend and TLS connection.
4. Verify real signup, sign-in and authenticated pages.
5. Configure separate non-production storage where permitted.
6. Preserve production data and secrets.
7. Establish and verify a restorable backup before production database migrations.
8. Identify any requirements that need Owner access or paid account changes.

Never perform destructive production database changes or claim a backup is restorable without recovery evidence.

---

## PHASE 6 — Two Separate Task Registers

### REGISTER A: INDEPENDENT WORK

Include only tasks that can be completed using available development access without my personal participation.

Each entry must contain:

- Task ID and feature.
- Priority.
- Existing PR/branch.
- Current status.
- Next technical action.
- Acceptance criteria.
- Test evidence.
- Deployment status.
- Blockers, if any.

Use these statuses:

- NOT STARTED
- IN DEVELOPMENT
- READY FOR TESTING
- TESTING
- READY TO DEPLOY
- LIVE & VERIFIED
- BLOCKED

### REGISTER B: OWNER ACTION REQUIRED

Include only actions that genuinely require me.

Each entry must contain:

- Task ID.
- Platform/service.
- Exact action required.
- Why it cannot be done independently.
- Link or location where I must act.
- Estimated effort, where practical.
- Whether the action requires payment.
- What evidence or result I need to provide.
- Which technical task it will unblock.

Separate these into:

1. **Can Do Now**
2. **Waiting for External Approval**
3. **Optional Owner Review**
4. **Requires Payment or Account Upgrade**

Never request passwords, recovery codes, private tokens or credentials through chat.

If access is required, use the provider's secure authentication process.

---

## PHASE 7 — Development and Deployment Rules

- Preserve all current production functionality.
- Do not modify booking fees. Leave the £1 booking fee and proposed £1.50/referral promotion changes untouched.
- Do not activate referral payouts or new commissions.
- Do not activate unsupported public provider integrations.
- Do not use production customer data in Preview.
- Keep external notifications and rebooking sending disabled until verified.
- Use focused PRs and logical implementation batches.
- Run relevant automated tests, TypeScript, lint, builds, browser checks and security checks.
- Repair failures caused by the changes before merging.
- Verify the exact final commit before deployment.
- Maintain rollback instructions.
- Deploy independently authorised, verified changes where all prerequisites have been met.
- Do not treat passing CI or HTTP 200 alone as successful end-to-end acceptance.
- Escalate genuine Owner-only decisions rather than guessing.

Existing standing authorisation permits implementation and routine release work. Do not interpret it as permission to bypass technical safety gates, override explicit PR-specific approval restrictions, purchase services or grant third-party permissions.

---

## PHASE 8 — Reporting and Continuity

At the end of each work session, provide:

**A. Completed Work**
- Implemented features.
- Merged PRs.
- Verified deployments.

**B. Independent Work Remaining**
- Tasks still available to progress without me.

**C. Owner Assistance Required**
- Exact actions I can complete myself while development is paused.

**D. Blocked Items**
- What is blocked.
- Cause.
- Responsible party.
- Unblocking condition.

**E. Next Recommended Batch**
- The next three to five highest-impact tasks.

Update the existing work log and task registers so another ChatGPT Work session can continue without repeating investigations.

**Final instruction:** Maximise safe, independent progress. If one integration requires my involvement, continue other authorised development rather than stopping the entire project.

Do not report work as completed or deployed unless it has actually been verified.

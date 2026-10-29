# GLOHAUS implementation checklist — 29 October 2026

Production target: `haroon-glohaus/glohaus1`, `www.glohaus.shop`.

## Releases

- [x] Verify connected Vercel project and GitHub repository access.
- [x] Recover commit `1360cbb93bb401aa788550365cdbc4f90ab1d89b` through PR #189.
- [x] Validate and apply fourteen-day Founding migration with checksum in application ledger.
- [x] Merge PR #189 as `d9ef66de46df7e041746f87d2f05a4bd9683ce3e`.
- [x] Verify Vercel production deployment `dpl_AnBwXUDeBpyNSViP8faFVnntZV4J` READY and assigned to all production domains.
- [x] Implement maintenance-safe Owner sign-in, password recovery and verified MFA continuation in PR #190.
- [ ] Merge and verify PR #190 after CI.
- [x] Implement and validate optional feedback timing and trial dates; apply matching additive function migration.
- [ ] Publish and verify feedback timing application release.

Terminal Git push cannot authenticate. Connected GitHub Git-data APIs successfully create trees, commits and branches; this is the working publishing path. The production homepage is intentionally in maintenance; no Owner setting was changed.

## Priority checklist

| Priority | Previous evidence | Work completed | Tests / verification | Production status | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 1 Access and releases | Main deployed, older PRs open; terminal push missing credentials | Verified correct project; recovered #189; #190 implements scoped access fixes | 89 targeted auth/session/MFA/maintenance tests, TypeScript, lint, production build | Founding release READY; access PR awaiting CI | Authenticated Owner refresh, logout/login and real PWA restart |
| 2 Booking fee | Current public copy says £1; one Owner amount control | Inspected fee configuration and snapshot architecture | No new pricing activated | Unchanged | £1.50 standard, £1 eligible first booking, dual controls, eligibility and concurrency checks, consistent public wording and receipts |
| 3 Founding | New-participant extension previously available | New participants receive fourteen days only; existing participants retain legacy eligibility; optional feedback gate and trial dates added | CI on #189 passed; SQL rollback validation; 43 commission/reward tests; production function verification | #189 live; feedback schema applied, UI release pending | Owner expiry notices; complete timing UI release and browser verification |
| 4 Referrals | Attribution, fraud-review and appreciation tables/functions already exist | Recovered isolated retained-contribution qualification helper; actual cash remains disabled | Reward tests; database schema inspection | Helper included in #189; no automatic payout | Full hybrid rewards ledger, caps, thresholds, reconciliation, ambassador/student/academy programme controls and issue #147 acceptance checks |
| 5 Marketplace | Existing multi-speciality, services, portfolio, orders and seller hub routes | Confirmed current implementation exists | Existing CI covers multi-speciality and seller isolation | Existing production implementation | Authenticated complete journeys, uploads, verification limits and reviews |
| 6 Integrations | Existing social and calendar tools/migrations | Confirmed existing professional business-tools and social-portfolio migrations | Not yet independently exercised | Existing implementation | Provider permissions, Meta review/account actions, end-to-end provider checks |
| 7 Booking/notifications/navigation | Existing reminder, journey and Smart Arrival code | Confirmed current CI coverage exists | Existing CI reports available | Existing implementation | Real iPhone/Android installed-app notification and navigation checks |
| 8 Design/PWA | Main includes loading-screen #187 and icon #188 | Preserved approved visuals; no duplicate redesign | Current production commit confirmed before releases | Existing approved design | Physical-device appearance, uploads, sessions, theme colour and map review |
| 9 Owner controls | Current controls and appreciation schema already present | Inspected current controls; no automatic recognition gifts/payments introduced | Existing admin CI | Existing implementation | Authenticated Owner control review; verify appreciation and reports |
| 10 Security | Advisor reports leaked-password protection disabled; existing RLS notices | Ran advisor; preserved role and MFA gates; verified anonymous feedback submission remains denied | SQL function grants verified; auth/authorization tests | Existing protections retained | Enable supported leaked-password protection; complete security audit and payment idempotency checks |
| 11 SEO | Homepage returns temporary maintenance 503 with Retry-After | Verified maintenance state, preserved crawler exemptions | Maintenance tests | Existing behaviour | Search Console status, sitemap/canonical/index coverage and public-page audit |
| 12 Final QA | Multiple old PRs overlap current code | Separated access, Founding and feedback releases | See per-release checks | Partially delivered | Finish remaining priorities and verify full authenticated journeys |

## Older PR review

| PR | Current-code finding | Release action |
| --- | --- | --- |
| #143 | Popular-services insights, customer invitation and growth reporting already present; current branch conflicts | Do not merge duplicate historical branch wholesale; verify remaining issue #147 requirements separately |
| #123 | Professional sign-in already uses approved professional motto and `professionalSignIn` frame | Current wording retained |
| #111 | Verified MFA continuation missing, but newer fresh-verification UI exists | Recovered scoped continuation in #190 while retaining fresh challenge |
| #86 | Current feature-vote page already handles unavailable database reads and uses newer results function; production migration history contains ambiguous-id fix | Keep current implementation; no old migration replay |
| #77 | Historical message layout branch conflicts with current shared stylesheet | Needs focused comparison/browser review, no wholesale merge |
| #68 | Current sign-in already distinguishes customer/PRO and prioritises Owner roles | #190 additionally preserves explicit Owner entry against stale intent |
| #67 / #64 | Current Stripe webhook handles dispute create/update/close and production has dispute migrations | Do not reapply old duplicate migrations; validate current payout guards separately |
| #62 | Current webhook handles provider refund events and reconciliation migration exists | Retain current flow; verify reconciliation with safe tests |

These findings identify existing code, not a claim that every affected authenticated journey was tested in this session. No real charges, refunds, withdrawals, outreach messages or rewards were initiated.

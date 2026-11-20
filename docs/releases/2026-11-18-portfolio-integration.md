# Portfolio experience — combined acceptance candidate

Status: implemented in an isolated development branch; NOT production-ready and NOT deployed.

Source inputs: #240 photo reliability head db63b79 (including main #241 and security #243), #233 unified management head a56ed50, #242 Concept C head 4574d19. Apply the source changes together; do not independently promote one Preview and assume the combination was tested.

## Integration corrections

- Preserve the deployed dismissible Outlook provider warning alongside social-only rendering. Both sets of regression tests remain.
- Preserve the automatic-publication OFF gate and current private-draft copy; the older #233 default-mode assertion now checks the actual approval selection, private-until-published explanation and absence of automatic publication while disabled.
- Use one shared server-side Preview gate for Portfolio and Connections. In this candidate, Portfolio has uploads plus social management, while Connections keeps calendar controls and a link to the social workspace. It no longer duplicates social post editing/connection settings in the Preview workspace. Legacy production behaviour remains until actual hosted acceptance and deliberate source/config rollout.
- Keep imported hidden/draft work private, existing service associations, featured social ordering, professional permission checks, calendar callbacks and provider readiness flags.
- Reuse the #242 public grid/viewer and #240 optimisation/retry/duplicate-submit guards. Photo updates now have a 45-second confirmation timeout, actionable connection/timeout feedback, preserved previews and retry controls; a timeout does not falsely claim the server failed. Do not enable public Instagram/TikTok, sending, payouts, fees or new commissions.

## Evidence and remaining gates

Combined local checks: 43 focused tests passed across business connections, workspace gate, photo reliability/formats and profile examples. Scoped lint, TypeScript and production build passed on the combined source. Final published-head CI/browser checks remain required.

Hosted acceptance remains blocked on the isolated PostgreSQL connection (28P01) and the existing private Blob store's Preview-only binding. Do not mistake HTTP 200 with streamed error digest for a working profile. Test with genuinely signed-in existing isolated customer/professional accounts and synthetic uploads only; never use production credentials/files or live charges.

Actual acceptance: upload/save/retry/format/size/crop/logo; one social workspace and calendar recovery; post draft/publish/hide/remove/feature/order/service association; published profile grid/filters/viewer/playback/sound/navigation; light/dark/mobile/desktop and access denial. Public provider consent/approval is a separate gate.

#242 still does not provide arbitrary named collection creation or pin/reorder controls for uploaded files; treatment collections use existing speciality assignments, and featured ordering uses existing social-post fields. Resolve those remaining agreed requirements through a reviewed additive data model and backup/recovery gate before declaring the complete Concept C work order fulfilled.

Rollback: this branch has no production effects or migrations. After a future authorised, verified release, use its recorded preceding glohaus1 deployment and selective source revert. Keep the independent security patch unless a verified regression requires otherwise.

## Native viewing integration, 18 November

Merged #242 native player source b433e5d with this candidate, retaining #233's gated single management workspace and #240's duplicate-save/timeout/photo fixes. WORK_LOG append conflict resolved by retaining both evidence histories; application source merged cleanly. Full local suite: **226 files passed; 1,801 tests passed, 2 skipped**. Scoped lint and TypeScript passed. Provider-frame fixture CI and real hosted acceptance are tracked separately. Public social launch flags remain unchanged/OFF; no database migration, payment or provider-account changes.


## 20 November — compose with the released immersive viewer

Current-main integration preserves #253/#254 rather than restoring the older viewer. Upload featured/order and custom collection memberships now compose with muted selected-video playback, mixed-media navigation, native social consent/player teardown, named-service booking links and scroll/focus restoration. The public repository's restricted-view published markers and removed upload limit remain intact. Default All Work remains mixed-source, and hidden/unavailable social rows remain excluded. The source-only display release is already live; this management candidate remains Preview-gated and not production-ready.

Added a component regression for pinned order, collection filtering, All Work reset, photo/video navigation and linked service context, plus four custom-collection viewer browser cases. Local focused tests: 57 passed; TypeScript/scoped lint passed. Local Chromium could not start because the execution environment refused socket creation; no browser assertion failed or was skipped. Use the unchanged runner browser infrastructure to execute acceptance. Genuine signed-in Preview/database/private-storage/recovery gates remain required; do not activate public account connections or apply candidate SQL in production.

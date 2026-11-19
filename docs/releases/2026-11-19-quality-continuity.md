# Owner QC continuity and release efficiency

Confirmed defects: Live vs pending displayed a fixed 8 November build regardless of the serving deployment; browser storage write failures could throw from the QC workspace; unreadable saved audits were silently overwritten after restore failed. The Owner-only route now supplies non-secret serving-build metadata, clearly distinguishes identity from verification, and links the persistent independent/Owner-action registers. Storage failures retain in-tab edits and offer export guidance; an unreadable snapshot is not overwritten. Existing manual audit/checklist/export flows and Owner authorisation remain intact. No server persistence or global feature certification is implied.

Focused UI/state/metadata and existing Owner QC regressions: 18 tests passed; scoped lint passed. TypeScript and production build passed; final-head CI required before release. No migrations or production records changed. This is a scoped QC improvement, not completion of all requested Owner administration.

Two native-viewing CI jobs were cancelled during browser/apt dependency preparation before product assertions. The foundation workflow previously ran both feature-branch push and pull_request copies for the same source. It now keeps all pull-request checks plus main-push checks, avoiding duplicate feature-push jobs. Both existing ffmpeg installation steps reuse an installed encoder, falling back to the existing apt install when absent. No assertion, job, security check, WebKit coverage or release test was removed.

This branch follows the separate #231 deposit candidate. Release it only after that candidate is verified and merged; then review the QC-only diff against main. Retain the preceding verified glohaus1 deployment as rollback.

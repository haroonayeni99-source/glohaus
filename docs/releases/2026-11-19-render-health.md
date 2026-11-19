# Public-page render health

Owner diagnostics and scheduled public monitoring previously treated HTTP 200 as healthy without consuming the document. Next.js can return that status with a shell and a later streamed render error. Both checks now share a bounded public HTML reader: require a main document, reject explicit Next error pages and non-redirect streamed errors, and stop after 2 MiB. Reports expose fixed reasons only, never HTML, digests, exception details or credentials. Existing Owner authorisation, private/no-store diagnostics, fixed public paths, request timeouts and scheduled retry behaviour remain intact.

This checks document delivery and known render failures. It does not verify interactions, authentication, bookings or payments. No database, sending, provider or financial changes.

Validation: 13 focused module/Owner API tests and four scheduled-monitor tests passed; scoped lint and TypeScript passed. Public production Shop currently returned 121,231 characters with a main document and no render-error record. Build, exact-head CI and final deployment checks must be recorded before claiming release.

Rollback: previous main 73a1e81 / glohaus1 dpl_5wsjVGpfLeRmoeNRCVxGC3SPYWbp, or revert only this change after subsequent independent releases.

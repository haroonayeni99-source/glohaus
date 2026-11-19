# Services & prices deposit notice visibility

Scope: existing #231, rebased onto verified current main/security patch. CSS only at runtime: preserve the pale deposit guidance notice while explicitly setting readable foreground/control colours in light and night themes. Constrain fieldset/input widths and wrap copy at narrow sizes. The prior globals-only patch could lose to the later night-mode input rules; the correction is scoped to this component in theme-controls.css. No component, booking calculation, deposit eligibility, fee, commission or payment source changes.

The actual DepositSelector is rendered with fictional Starter and verified professionals in the existing browser fixture harness. The browser workflow checks both themes at 320/390/820/1440, AA text/control contrast, no horizontal overflow, Starter's lack of editable deposit controls and unchanged verified fixed/percentage selection and 15–40% bounds. Existing booking-theme checks remain in the same job.

Local Chromium cannot start because of environment socket restrictions. Final-head CI must supply browser evidence before release; fixtures do not represent signed-in production acceptance. Preview readiness, current source review, and post-deployment public route smoke remain required. No database change. Rollback: previous verified glohaus1 deployment dpl_HkSncNoneVmxm9c5medvhDC8u1Ne / main 7d288fc.

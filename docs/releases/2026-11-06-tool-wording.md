# Customer and professional tool wording — 6 November 2026

Baseline 7448b219e96cf187612fd2dbdf31b61e60459692. Existing repository and glohaus1 project retained.

## Audit and changes

Reviewed customer/professional account route copy and shared tool explanations. The targeted release updates 19 existing files. Already concise labels, homepage/marketing pages, Shop/Discover presentation and legal text remain unchanged. This is a scoped clarity pass, not a claim that every screen has a new physical-device acceptance result.

| Area | Improvement | Details retained |
| --- | --- | --- |
| Customer Acquisition & Growth | Short summary; expandable counting methodology; Payments after refunds replaces Net captured | Source evidence/unknown/conflicting sources, exclusions, return definition, financial provenance, payments versus earnings, unique-count caution and no fee/customer ownership implications |
| Business Hub | Plain explanations of returning clients and the return window | Exact date windows, full observation time, excluded bookings, no estimated growth or active rewards |
| Customer tools | Clear empty states for follows/saved posts; shorter notification, invitation and booking guidance | Referral claim deadline and reward-off state, refund review versus refund sent, quote versus wallet balance |
| Communications | Clear Activity alerts and Marketing emails headings; shorter device instructions | Essential emails, independent marketing consent, SMS absence, iOS installation steps, location/journey permissions and no background GPS |
| Professional setup, verification, portfolio, orders and seller tools | Shorter descriptions of the next action | Verification separate from setup/plan, Stripe requirements, draft/public rules, gross versus net sales and refund exclusions |
| Wallet and withdrawals | Shorter balance/release instructions; removed a repeated dispute paragraph from How money moves | 24-hour service/48-hour product release conditions, tracked delivery/customer confirmation, dispute amount plus 50% buffer and full-freeze conditions, fees, tax responsibility and payout restrictions |
| Social/calendar tools | Concise purpose, privacy and buffer explanations | Existing TikTok fixes/handlers, consent, encrypted credentials, external calendar delays, manual-link rules and public profile/publication requirements |
| Service/product selections | Shorter explanation of separate booking and buying | No discount/combined checkout, existing prices, separate fees/refunds, own eligible listings and fresh eligibility checks |

No changes to SQL queries, calculations, API calls, form handlers, routes, permission checks, state logic, customer data, payment settings or production integration configuration. The only markup change is native details/summary around secondary reporting methodology. All content remains in the existing components, without new libraries or styles.

## Verification

83 existing tests across nine files passed: business-connections-ui, business-insights, communications-navigation, professional-notification-settings, notification-live-ui, professional-verification, withdrawal-reliability-api, social-portfolio-flow and business-tools. TypeScript, scoped ESLint, git diff check, secret-pattern scan and production webpack build passed. No extra tests that merely assert new wording were added.

Actual AcquisitionReport component with synthetic figures checked inside 390px and 1024px frames. Narrow-frame document width stayed within its viewport, with the wide table in its existing horizontal scroll container. Definitions expanded/collapsed with click and Enter. This is responsive browser evidence, not physical Safari/Chrome or installed-PWA certification. Desktop production page checks and deployment identity are reported in the delivery message.

No new database migrations or analytics activation. Restore branch restore/before-tool-wording-20261106 retains the baseline; selectively revert this copy release without resetting databases or credentials.

# Parts 1–4: completion audit, 15 September 2026

The numbered milestones below follow the implementation sequence in MVP-ARCHITECTURE.md. Implemented code and local tests do not establish live completion.

| Part                                        | Implemented                                                                                                                                               | Required before completion                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. Account foundation                       | Supabase Auth integration, server-owned customer/professional/admin roles, RLS, admin MFA, setup documentation                                                    | Provision Supabase Auth/PostgreSQL, test distinct real identities, deployment and recovery checks                                           |
| 2. Profiles, services, portfolio, discovery | Public profiles, secure image processing/storage integration, service CRUD/deactivation/images, active-only menus, search, likes/saves/sharing            | Provision Blob, run real authenticated creation/upload/public-view journeys; video and product shop are additional unfinished scope |
| 3. Availability and bookings                | London/DST handling, weekly hours, holidays/breaks, booking snapshots and holds, zero-deposit confirmation, cancellation, private paginated booking views | Independent real PostgreSQL concurrency tests and complete staging customer/professional journey                                    |
| 4. Appointment deposits                     | Stripe Connect/hosted Checkout/webhook/refund integrations, customer refund appeals, MFA-gated admin percentage overrides and local tests                 | Configure Stripe, test hosted payment end-to-end, dashboard refund/dispute reconciliation and checkout-creation failure recovery    |

**Parts 1–4 are not all complete.** Direct product purchases are separate from appointment deposits. Their seller/fulfilment model and real commerce integration are not configured; product checkout is not available. Under-18 professional access remains a proposed safeguarded pathway, not an enabled release feature. Native mobile and video remain unimplemented.

The current feed can be inspected at http://127.0.0.1:3001/. Port 3002 remains an isolated static profile visual fixture, not a functional booking or account environment.

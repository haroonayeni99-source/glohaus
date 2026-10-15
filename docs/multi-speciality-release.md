# Multi-category and multi-speciality release

This release extends the existing GLOHAUS account, catalogue, policy, reservation and financial systems. It has not been applied to the production database or deployed. The source branch disables Vercel deployments. Production rollout requires the owner's explicit approval.

The existing category manager retains its search, visibility filters, add/edit controls and immediate saved feedback; its editor now includes descriptions, imagery and search synonyms.

## Result

One professional can declare multiple categories and specialities, choose a primary speciality and publish separately classified services. The initial reference catalogue includes Hair → Braiding → Knotless Braids and Hair → Locs → Retwist, alongside Nails, Makeup, Skin, Lashes, Brows, Hair Removal and Aesthetics.

Professionals confirm their own specialities. This does not create a verification badge. Existing broad-category services remain available in their existing status and need explicit classification; the migration does not guess their speciality.

Service variations replace the base price and duration; extras add to them. Quotes, accepted policy tokens and booking snapshots are calculated and validated on the server. All services retain the same professional calendar, wallet, inbox and Stripe account. Existing commission, customer fees, deposits, verification limits, founding arrangements, cancellation and refund rules remain authoritative.

## Acceptance coverage

| Requested acceptance case | Automated evidence |
| --- | --- |
| Braiding and Locs under one professional | `multi-speciality.test.ts`: declaration, primary speciality and one profile |
| Separate Knotless Braids and Retwist services | Service creation and public profile assertions |
| Services under the correct specialities | Public service classification and category relationship checks |
| Retwist search finds the professional | Exact name and recognised aliases, including `retwst` |
| Knotless Braids search finds the same professional | Exact name and aliases; one Hair result without duplicate profiles |
| Unrelated services do not match | Cornrows and Facial exclusion checks |
| One calendar and wallet | Cross-service collision rejection, time-off checks, two actual reservation/payment ledger paths and one wallet |
| Filtered portfolios and Discover | Shared media asset, Locs-only feed and portfolio associations |
| Removing a speciality preserves history | Service pausing, immutable booking snapshots, merge and move tests |
| Owner/Admin definition management | MFA/ownership, audited edits, merges, moves, homepage links and category coverage |
| Mobile and desktop interfaces | `check-multi-speciality.mjs`: 320px, 390px and 1440px, light/night themes |
| Existing authentication, policies and payments | Full regression suite, session browser checks and existing simulated checkout/provider tests |

The PostgreSQL tests apply the complete migration history to isolated PGlite databases. API journey tests exercise real application handlers with isolated identity and payment providers. Browser checks exercise real components with fictional data and intercepted requests. These do not constitute a new live Stripe transaction or a production smoke test.

## Validation

Run `pnpm lint`, `pnpm typecheck`, `pnpm exec vitest run --maxWorkers=2` and `pnpm build` locally. GitHub Actions also runs the existing browser regressions and the new speciality journey. Check the PR's final commit checks for the release gate and browser screenshot artifacts.

The local suite contains 984 passing tests across 107 files. The existing speciality browser run passed all six viewport/theme combinations. The final source changes are submitted to the same checks before review.

## Database and rollout notes

The additive migration is `db/migrations/20261015023135_multi_speciality_catalogue.sql`. It retains category IDs, existing professional information, service IDs, prices, policies, bookings and payment records. No new professional identities or payment accounts are created. New reference and relationship tables use forced RLS; mutation entry points enforce ownership or the existing verified Owner/Admin boundary. Search and relationship indexes cover speciality, template and service lookup.

The migration checks the inspected reservation and policy integration anchors and aborts if their definitions differ. Those anchors were checked read-only against the live database. Existing migration-history drift must be reviewed: do not run the entire historical migration backlog against production. After explicit approval, review and apply this migration in a transaction using the existing deployment procedure, then release the matching application source and perform a production smoke test. Do not remove catalogue or snapshot columns as a rollback shortcut.

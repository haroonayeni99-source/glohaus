# Professional Rules & Booking Policies — review checkpoint

Date: 14 October 2026. Repository: `haroonayeni99-source/glohaus`.
Branch: `feature/professional-booking-policies`.

The policies release is deployed at **https://www.glohaus.shop**. Vercel deployment
`dpl_EpRWp47j1PNcRuNdANNzbiERA7YY` is READY and its production domain promotion completed.
Supabase migration `20261014171115_professional_booking_policies` was applied successfully.
All 11 existing bookings were preserved with legacy policy snapshots. The site is open.
The final deployment runs in London (`lhr1`), preserving GLOHAUS’s existing regional setup.

Deployment used reviewed source files directly in the existing Vercel project.
The user explicitly approved synchronizing this deployed release to GitHub on
14 October 2026. This release branch contains the deployed source, migration, tests
and live verification record for merging into `main`.
Local release source commit: `12d4a0975f13f532f9b1f473033f8ea18556afa7`.

Live HTTP checks passed for Home, the public professional profile, service policies,
the public policy API and the professional/Admin sign-in gates. A browser check
reached the booking summary with matching prices, two unchecked acknowledgements
and a disabled payment button. No booking, payment, refund or email was sent for that check.
The new policy tables have forced RLS, and post-migration advisors reported no new
policy-related findings. Existing unrelated advisor notices remain unchanged.

The live email suppression rule was preserved after comparison with the production
function. Its new regression test passes: the updated policy database suite has
32 passing tests. GitHub CI subsequently passed all 886 tests in 98 files,
lint, typecheck and the production build. Its browser harness required an
explicit policy-repository fixture and policy stylesheet inclusion, so the
Owner/Admin navigation checks can render the new section without importing
server-only database code into the browser.

Authenticated customer/professional/Admin browser journeys, mobile/night rendering,
real provider tests and multi-session concurrency verification remain outstanding.
The earlier review and implementation notes below record the pre-release checkpoint.

## Where the features appear after an approved release

| Audience | Entry point | Behaviour |
| --- | --- | --- |
| Professional | `/professional/policies`; professional shortcuts, mobile menu and Business tools | Edit general and service-specific drafts, preview, save, publish/unpublish and inspect version history. Unsaved changes prompt before leaving or switching scopes. |
| Customer | `/p/[slug]` and `/p/[slug]/services/[id]` | Review applicable published policies and prominent prices, deposits, fees, cancellation and preparation requirements. |
| Customer | Existing booking checkout | Affirmatively acknowledge the current version, with a separate early-service request where needed. Server checks reject stale or missing acknowledgement. |
| Both booking participants | `/account/bookings/[id]` through their existing booking lists | Revisit immutable agreed terms; reschedule, record arrival, review shortening offers, manage private preparation and photographs, assess refunds and inspect change history. |
| Verified Owner/Admin | `/admin#professional-policies` | Search professionals and bookings, inspect versions and accepted snapshots, approve/reject/flag wording, review evidenced retention, inspect audits and open associated payment disputes. Existing MFA and role checks apply. |

## Implemented

- Structured grace periods, cancellation notice, 15%–40% verified deposit choices,
  rescheduling notice/counts, optional first free reschedule, guest and child choices,
  preparation templates, reference photographs, consultation and patch-test checks.
- Custom text validation and character limits. Free-text instructions require an
  authenticated Admin review before publication. Review is not legal certification.
- Service-specific scalar choices take precedence; preparation, restrictions and
  safety requirements supplement general rules. Blank service arrival instructions
  inherit general instructions. Preview follows the same precedence.
- Immutable published versions and accepted booking snapshots. Existing bookings
  are backfilled with their original prices and explicitly unrecorded legacy
  acknowledgement; legacy refund decisions continue through the existing path.
- Publication and reservation share a transaction advisory lock. Reservations
  compare authoritative price, deposit and booking fee with acknowledged values
  and roll back on mismatch. Accepted commission/pricing records remain connected.
- Server-side notice and rescheduling count checks, existing availability and
  overlap safeguards, rechecked approval, and recorded rejection explanations.
- Late arrival recording creates no automatic penalty. A shorter service needs
  customer agreement; a professional cancellation makes full-refund protection apply.
  New-policy no-show records require refund review instead of automatic forfeiture.
- Refund floors use the accepted terms, the London calendar cooling-off deadline,
  professional cancellation protections and approved evidenced losses. Professional
  decisions and the existing Admin appeal path cannot bypass that floor.
- Existing Stripe refund idempotency and wallet reconciliation are reused; policy
  saving and appointment changes create no new Stripe charges. Existing commission
  reserve, payout and dispute protections remain in their original pathways.
- Private preparation is restricted to booking participants. Optional health
  information needs separate explicit consent and supports withdrawal. Private
  reference uploads are sanitized to WebP, limited to three and served without caching.
  Preparation text and photographs are purged 30 days after the appointment by the
  existing maintenance worker. Accepted terms are retained independently.
- Existing email outbox claims the new appointment events; existing retry and
  idempotency machinery is retained. Confirmation email content includes a copy of
  accepted public terms, without private preparation or professional commission.
  Policy moderation notices use the existing in-app notification infrastructure.
- Forced RLS on the nine policy/preparation/audit tables, explicit function grants,
  restricted existing function-owner roles and server authorization on every mutation.
  Admin policy review excludes customer health information and reference image bytes.
- Scoped styles use GLOHAUS theme tokens, wrap actions and stack policy fields on
  small screens. Publication/review dialogs have accessible names. Unrelated approved
  layouts and existing navigation controls are retained.

## Validation

| Check | Result |
| --- | --- |
| Full Vitest suite | **885 passed, 98 test files**, 36.30 seconds |
| New policy database tests | **31 passed**: versions, stale acknowledgements, direct API function permissions, legacy protection, money/commission snapshots, notice/counts, privacy, refunds, audit, outbox claims and DST boundaries |
| New policy API integration tests | **8 passed** with real migrations/RLS and isolated identity/provider fixtures: ownership, origin checks, MFA, persistent publication, checkout acknowledgement, participant privacy and sanitized private images |
| New policy interface tests | **4 passed** in jsdom: unsaved changes, publication confirmation/cancel, unchecked acknowledgement/stale checkout reset and Admin review reason |
| ESLint | Passed |
| TypeScript `tsc --noEmit` | Passed |
| Next.js production build | Passed; new pages and API routes compiled |
| `git diff --check` | Passed |

Database tests use isolated PostgreSQL through PGlite. Identity, Stripe and email
providers are fixtures; these results do not prove a live Supabase sign-in, real
Stripe capture/refund or delivered email. Existing simulated payment, wallet,
commission and dispute regression tests also passed.

## Migration and release limits

The following migration was authorized by the user’s deployment instruction and is now applied:

`db/migrations/20261014144536_professional_booking_policies.sql`

It adds the policy tables, backfills legacy booking terms and replaces the public
booking/refund operations with protected wrappers. It also extends notification
constraints and the existing email claim function.

**Coordinate migration and application rollout.** This migration revokes the old
two-argument reservation entry point. Applying it while the old application is
still serving bookings will make old checkout requests fail. A reviewed release
needs a controlled booking maintenance window, compatible schema/application
versions and a rollback plan; do not apply this migration independently to production.

Remaining full-journey verification:

1. The migration and production release have completed; retain the coordinated rollback constraint above.
2. Verify authenticated customer, professional and Owner/Admin flows in a browser,
   including desktop/mobile and light/night layouts. Live public desktop booking review was checked after deployment; authenticated mobile/night journeys remain unverified.
3. Verify the existing provider configuration with a controlled payment/refund and
   email delivery after authorization. No live charges or messages were made here.
4. Exercise concurrent publication/reservation against a staging PostgreSQL database.
   Advisory locks and immutable snapshots are implemented and database-tested, but
   PGlite’s serialized connection is not a true multi-session concurrency test.
5. Review the final published business wording for the relevant treatments. Software
   and Admin approval cannot certify a custom clause’s enforceability.

The established application timezone remains `Europe/London`; international
per-professional timezone configuration was not introduced. Policy updates apply
to future bookings. The implementation does not offer a flow to rewrite an existing
booking’s accepted policy; any different agreement needs separately reviewed handling.

## Changed files

New data layer:

- `db/migrations/20261014144536_professional_booking_policies.sql`
- `src/modules/policies/{domain,http,repository}.ts`

New pages, routes and components:

- `src/app/professional/policies/page.tsx`
- `src/app/p/[slug]/services/[id]/page.tsx`
- `src/app/api/v1/policies/route.ts`
- `src/app/api/v1/professional/policies/route.ts`
- `src/app/api/v1/admin/policies/route.ts`
- `src/app/api/v1/bookings/[id]/policy/route.ts`
- `src/app/api/v1/bookings/[id]/policy/availability/route.ts`
- `src/app/api/v1/bookings/[id]/policy/photos/route.ts`
- `src/components/professional-policy-editor.tsx`
- `src/components/professional-policy-summary.tsx`
- `src/components/booking-policies-panel.tsx`
- `src/components/admin-professional-policies.tsx`
- `src/components/professional-policies.css`

Existing integration points changed:

- Account booking detail page, Admin page, professional profile page and Business tools page.
- Existing booking/create/update, professional refund and Admin refund-appeal routes.
- Existing maintenance and notification workers, notification domain and repository.
- Booking picker/list, professional profile renderer, refund form and layout CSS imports.
- Professional shortcuts/mobile menu and Admin navigation/workspace confirmation boundary.
- Existing booking, finance, dispute, blocking, profile, journey and notification tests
  updated to send valid policy acknowledgement fields while retaining their original assertions.

New tests:

- `tests/professional-policies.test.ts`
- `tests/professional-policy-api.test.ts`
- `tests/professional-policy-ui.test.ts`

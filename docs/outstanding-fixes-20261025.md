# Outstanding-fix audit and future services

## Reused production features

Production already serves both domains through `glohaus1` on the existing Pro team. The old Hobby team has no linked Git project. Hourly maintenance and minute notification recovery remain unchanged; the task audit is in `cron-deployment-target.md`. No plan purchase or external scheduler was introduced.

The MUA homepage update, Makeup discovery link, loaded image and preserved Waxing speciality were verified in the preceding production release. Existing category carousel/mobile scrolling, Android/iPhone engine checks, PWA theme colours/offline updates, maps, sessions, Owner uploads, notification preferences, moderation, programme controls and Owner/Admin task navigation have isolated regression coverage. Physical phone checks remain separate from browser emulation.

Resend read-only checks confirm one existing Support inbox, verified receiving MX and sending records, sending/receiving enabled, and the existing support webhook enabled. Earlier initial and follow-up support forwards are marked delivered to the business Gmail. No duplicate inbox, DNS record, webhook or new test email was created. The connected Gmail account is personal, so business-inbox actions and a complete Gmail reply round trip are not represented as independently tested. Existing ticket linking is based on validated sender/recipient and references; this is not full Gmail dashboard synchronisation.

Existing grouped Owner/Admin navigation, task search, explanations and dangerous-action confirmations are retained. The new provider review sits inside Service Categories and loads only when opened; it does not add dashboard polling or a duplicate dashboard.

## New catalogue and provider controls

- Existing Makeup, Soft Glam, Full Glam and Bridal records are preserved. Editorial Makeup speciality/template and a MUA search synonym are added.
- Teeth Whitening and Tattoos are created inactive. No professional is approved and neither category is opened by this release.
- Only an Owner with the existing MFA/verified challenge can change these category definitions or record/revoke provider approval. Existing category controls remain the launch/hide mechanism.
- Opening a category is separate from provider approval. Current professional verification, recorded evidence checks and an unexpired approval are required. Expiry, revocation, loss of verification or category closure makes the regulated service unavailable in the public service catalogue and quote/reservation path. A booking insert trigger enforces the gate independently of the client/API. Existing bookings/history are preserved.
- Private, RLS-protected evidence contains registration references and review notes, not patient records. Records are never publicly exposed. Approvals/revocations use the existing audit log; approvals have a maximum one-year term and must expire no later than the earliest relevant evidence expiry. The UI clearly states that the Owner must check evidence; no automatic register verification is claimed.
- Initial whitening launch supports verified GDC-registered dentists only, with registration, insurance and clinical/training/assessment/consent checks. Hygienists, therapists and clinical dental technicians require a separate patient prescription/supervision workflow before being enabled. This conservative launch scope does not assert those professions can never legally provide whitening.
- Tattoo review covers relevant provider/premises registration or licensing, insurance and hygiene/infection-control/age safeguards. Local requirements vary. Existing 18+ eligibility stays intact.

Primary references checked 25 October 2026:

- https://www.gdc-uk.org/standards-guidance/information-for-patients-public/tooth-whitening-and-illegal-practice
- https://olr.gdc-uk.org/
- https://www.gov.uk/find-licences/skin-piercing-and-tattooing

## Validation and rollout

Isolated database/API checks cover hidden launch state, Owner/MFA enforcement, private evidence, incomplete evidence, dentistry scope, approval expiry/revocation, public visibility, quotes, booking inserts and unchanged ordinary service prices/deposits. Browser fixtures cover phone/desktop widths, both themes, lazy loading, confirmation cancellation, accurate save/refresh failures, reason-only revocation and draft reset. Existing support, mobile, session, map and security checks are reused. No Stripe sandbox, live charge, refund, payout or production test booking is part of validation.

Apply the additive migration only after checks pass, retaining its repository checksum alongside Supabase migration history. It rejects unexpected existing regulated services rather than silently changing them. The view wraps its current definition, preserving every existing visibility predicate and column; quote calculations remain unchanged. Deploy the matching application tree, verify both future categories remain inactive and no approval records were created, then verify the live Owner controls and public site without changing settings.

Rollback is the previous READY application deployment `dpl_B6uFysdxHEuFVEpKrMnSGwcR8PeT` (commit `adea85d421bb4a7835ce35c3c91fc88913d80bf8`). The additive database gate can stay in place with both new categories hidden; do not delete evidence/history or weaken eligibility to roll back the UI.

Live commission percentages, inactive pricing proposals, deposits, withdrawal/payout policies, Stripe configuration and earned founding benefits are outside this change. No paid provider or service was added. Remaining real-world verification is business Gmail replies and physical-device installation, uploads and push; eligible provider evidence must be reviewed by the Owner before future category launch.

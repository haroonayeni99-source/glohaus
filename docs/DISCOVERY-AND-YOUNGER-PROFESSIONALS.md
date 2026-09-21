# Discovery and younger professionals

Product direction recorded 15 September 2026. This is a proposed implementation plan; it does not enable under-18 onboarding or represent completed safeguarding controls.

## Customer experience

Make discovery the main entrance: one visual post at a time, swipe/scroll navigation, clear category filters and browsing without purchase or registration. Support designs, finished work and tutorials. Keep the creator's business name and profile link visible; show services and prices when a post is attached to a service. Booking is optional and intentional.

Retain glohaus's professional identity through consistent photography, readable typography, transparent prices, accurate credentials and reviews from completed appointments. Do not imply that every professional is verified. Avoid public age labels or a separate “junior” brand.

Use a small navigation set: Discover, Find a professional, Saved and Your space. Explain that current saves last only for the visit. Keep reduced-motion support, keyboard navigation and clear stopping points. Future video should have accessible playback controls, captions and sound off by default. Do not add unsolicited messages, pressured purchase prompts or streaks.

Current implementation has photo/written-post discovery, category filters, professional links and session-only saves. Video upload/playback, persistent saves and product commerce remain unimplemented. Marketplace placement should be optional and visibly distinguished from booking a service; checkout approach remains unresolved.

## Proposed 16–17 professional pathway

Keep the three existing roles: Customer, Beauty Professional and Admin. Age and approval are private eligibility attributes, not additional roles. A professional aged 16–17 should have the same professional presentation once approved.

Proposed progression: private draft → age/guardian/eligibility review → approved portfolio publication → separately approved booking access. No public publication or bookings merely because a user enters “16”. Rejection, expiry or withdrawal must remove the corresponding capability, including through direct API calls.

Before enabling this pathway, establish age assurance appropriate to the risk; guardian approval where required; service-specific qualification, insurance and local eligibility checks; and an administrative review process. Turning 16 alone does not establish eligibility to offer every beauty treatment. Decide customer age rules separately: this professional age proposal does not silently permit under-18 customers to book all treatments.

Proposed privacy defaults for younger professionals: public town/city only, no home address, personal telephone, email, date of birth or age badge. Existing voluntary contact fields must be restricted in both validation and public SQL projections. Social links need a reviewed policy because they can bypass platform contact controls. Keep direct messaging out of this phase. Reporting and moderation must exist before younger profiles or content become public.

## Private data and enforcement

Proposed entities, not migrations yet:

- `professional_eligibility`: one row per professional, age-band verification outcome/reference, review status, publication and booking approvals, expiry and policy version. Minimise retained identity data; prefer provider references over document copies.
- `guardian_authorisations`: professional relationship, separately verified guardian identity/reference, purpose, consent version, approval/withdrawal timestamps. A guardian does not automatically gain access to customer booking details or the professional account.
- `service_eligibility`: professional/service approvals and evidence references with expiry. Do not treat profile approval as blanket approval for all treatments.
- `safety_reports`: reporter, content/profile reference, reason, restricted evidence, moderation state and outcome.
- Audit entries for every approval, rejection, revocation and access to sensitive evidence.

Apply owner-scoped row-level security, restricted admin access and explicit public projections. Never include age/guardian evidence in public profiles, feed responses, analytics exports or ordinary application logs. Enforce eligibility inside publication and booking transactions, including zero-deposit bookings, media serving and discovery visibility. Suspension and guardian withdrawal must invalidate access consistently. Define handling of existing appointments when eligibility changes rather than silently cancelling them.

## Provider and regulatory checks before release

The ICO Children's Code addresses services likely to be accessed by under-18s. Assess the whole platform's child-access and privacy design, not just the registration form. Geolocation should be off by default. Sources: [ICO introduction](https://cy.ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code/) and [ICO geolocation standard](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/10-geolocation/).

Stripe documents guardian agreement and additional information for under-18 connected-account users. Confirm the exact supported GB Express onboarding and representative arrangement before enabling any minor's paid bookings. Do not assume the general guidance establishes support for every account configuration. Card information remains with Stripe. [Stripe Connect agreement guidance](https://docs.stripe.com/connect/updating-service-agreements?locale=en-GB).

England's school-leaving and employment rules need checking against the individual's circumstances; a birthday alone is insufficient. [School leaving age](https://www.gov.uk/know-when-you-can-leave-school), [child employment](https://www.gov.uk/child-employment). Assess applicable online-safety obligations for the user-generated feed and obtain appropriate review of the proposed release policy before launch.

## Implementation order and tests

1. Finalise the age, guardian, service and customer eligibility policy and provider compatibility. Keep existing production readiness blockers visible.
2. Implement private eligibility records and server-side publication/booking gates, with cross-user, forged-status, expiry, withdrawal and direct-API tests.
3. Add approval and reporting/moderation workflows with audit trails. Test public media/feed/profile/contact redaction and that guardians cannot access customer records.
4. Enable the approved younger-professional pathway only after end-to-end verification. Verify the age-18 transition without silently broadening data access.
5. Add video discovery separately after storage, moderation, accessibility and cost limits are designed. Test mobile scrolling, keyboard controls, captions and playback preferences.

No new payment implementation is authorised by this document. This plan must not be presented as evidence that younger-professional safeguards already exist.

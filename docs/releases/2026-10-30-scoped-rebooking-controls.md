# Scoped rebooking consent and professional controls

Extends the disabled rebooking pilot on the isolated integration branch. No automatic outreach, pricing, rewards, booking or payment behaviour is activated.

## Behaviour

- Customer opts in to optional **email** for a named professional after a completed paid visit; global rebooking consent is separately required. Existing global consent is never copied into scoped consent or switched on by this feature.
- A professional starts paused until they explicitly save their controls. They can pause their own reminders, choose a default interval or override an owned service (14–180 days). A blank service override restores their default. These are marketing intervals, not treatment advice.
- Qualification uses the actual chosen interval and the existing seven-day eligibility window, instead of the old global 28-day prefilter. Retains all existing payment/refund/dispute/account/block/future-booking/cooldown exclusions.
- Consent withdrawal and professional pause suppress their waiting jobs. Re-opt-in/resuming never resurrects those jobs. Eligibility and both consent scopes are checked again before dispatch.
- London-time dispatch window: 09:00 inclusive to 20:00 exclusive, respecting daylight saving. Quiet hours are rechecked between claim and provider submission.
- Private tables expose only authenticated actor-bound functions. Identity is derived from the existing verified auth context. API schemas accept no user identity, global launch or reward fields. Consent/settings/service changes have immutable audit events.
- Existing preferences and professional notification pages link to the new scoped screens without changing layouts or notification permissions.

## Schema and staging

Candidate SQL: `db/patches/rebooking-scoped-controls.sql`.
SHA-256: `c17e1e5556766db985138bd4631af24912e15d73a5f4e725f8b3d641851c1eef`.
Applied only to `rqsyakggwmpkqzzogvll`, history name `rebooking_scoped_controls_candidate`, version `20261030211728`.

The candidate is deliberately outside the production migration plan. The earlier Supabase CLI telemetry action was rejected by automatic review; it was not retried or bypassed. A normal CLI-generated production migration still needs packaging/reconciliation before release. Do not invent a filename or replay the candidate against an already-patched staging database. Verify the checksum and existing function definitions first.

After staging application: automation false; unpaused professionals zero; enabled named consents zero; scope audit events zero; referral launch false and emergency stop true. No email sent, no customer consent imported, no production database mutation. Security advisors rerun.

## Verification and remaining gates

59 focused tests across scoped API/DB and existing reminder/worker isolation passed; TypeScript, targeted lint, whitespace checks and production build passed before publication. A dedicated disposable native PostgreSQL job verifies the scoped database cases without access to a remote database. Full-suite and final-head CI results belong in the PR release record; do not infer them from this initial checkpoint.

Authenticated hosted customer/professional/Owner journeys require user-controlled credentials/MFA and remain unverified. Production backup/restore verification, migration packaging and explicit Owner activation are still required. Physical-device and external-provider checks are separate. Incremental rebooking measurement/holdout remains a later pilot step requiring real completed bookings and sufficient volume; no retention uplift is claimed.

# Sign-out, Discover uploads and verification badges

Prepared locally on 13 October 2026; not deployed.

- All eight existing placements use the shared sign-out component. A dedicated class gives that button the homepage's rounded styling, hover/focus treatment and reduced-motion support. Other text links and sign-out behaviour are unchanged.
- Discover posts and Stories share the upload control. Selecting a supported photo or video now enables Upload and attach without requiring an unexplained description. An optional description is preserved; a neutral description is supplied when blank. Short invalid descriptions produce a visible message. Failed photos remain selected for retry; expired sessions receive a specific explanation.
- Public cards, profiles and map results show distinct Identity, Business and Professional verification crests with readable text. Existing verified status continues to represent identity/payment checks. Business and Professional crests require their respective recorded approvals. Pending, unverified and restricted accounts cannot display approved crests, even with stale flags.
- Owner/Admin can manage the three existing flags through the existing protected, audited database routine. Business or Professional approval requires identity approval. Legacy requests without badge fields retain their existing routine and behaviour.

## Data boundary

The proposed migration appends three safe booleans to the existing public professional view. It retains the current view definition, the restricted catalog owner, RLS policies and publication filtering. No verification records, payments, fees, account permissions, eligibility rules or website availability settings have been modified in production.

The Supabase database was inspected read-only to confirm the existing verification columns and public-view definition. Apply the additive view migration before deploying the new application queries.

## Verification and release

- All 740 automated tests pass, including isolated database badge visibility, upload controls and retries, public projection privacy, Admin payload validation and the existing cart fix.
- Full lint, TypeScript checks and production build pass.
- The existing browser upload check now covers blank descriptions as well as custom ones.
- Local browser installation failed because the download was truncated. Browser/theme screenshots remain pending; GitHub's existing browser and layout workflows must pass before release.
- GitHub publication was previously rejected by automatic approval review because explicit publishing permission was missing. No workaround was attempted. The code remains local until that permission is provided.

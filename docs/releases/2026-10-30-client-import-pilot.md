# Consenting existing-client import pilot

Private professional-only CSV import, with browser preview, explicit column mapping and confirmation. Maximum 500 rows/file, 512 KB/file and 500 active contacts per professional. Store permission date and specific evidence for each record. This is storage permission evidence, not verified marketing consent.

Import does not create customer accounts, booking attribution, referrals, rewards, marketing preferences or messages. Unknown columns are ignored in preview and unknown fields are rejected by the API/database. No raw CSV is persisted. Duplicate normalized addresses and replayed batches cannot create duplicate contacts. Removal clears contact details, retains a salted matching fingerprint to prevent restoration on reimport, and writes a private permanent audit event.

Verification completed:
- 15 focused tests: CSV boundaries/quoting, explicit permission, dates, duplicate addresses, API authentication/role/origin checks, field injection, database ownership, idempotency, removal, reimport prevention, cap/atomic rollback and private audit access.
- Clean production build and targeted lint passed.
- Hosted isolated staging migration applied; synthetic import/removal smoke test passed in an explicitly rolled-back transaction. Operator context smoke test does not substitute for local beauty_app RLS tests.

Remaining gates: full CI, authenticated browser preview, verified restorable production backup before production migration. No production migration or import deployment has occurred. No automatic marketing or pricing/reward launch is included. The private fingerprint is retained for suppression; future retention changes must preserve suppression and privacy requirements.

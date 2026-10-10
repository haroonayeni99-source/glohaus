# GLOHAUS bug fixing handoff — 10 October 2026

## Scope

Investigate symptoms, preserve approved desktop/mobile designs, make targeted fixes,
and verify them. Payment rules, real money movement, secrets, and production data
deletion require explicit user approval. Preserve the existing no-preview preference.

## Baseline

- GitHub: `haroonayeni99-source/glohaus`, `main` at
  `8e878a2e5b29c02cc3311fe1c8effe86759da5b0`.
- Vercel: `glohaus1`, production deployment
  `dpl_F9yb9qDoBYC28wMyAKxWhrpTbV81`, READY and sourced from that commit.
- Supabase: Glohaus, `tyycrmmczsgnowditnii`, ACTIVE_HEALTHY.
- Production checks used read-only SQL and metadata/log reads. No production write,
  secret change, deployment, or money movement was performed.

## Verified messaging bug and fix

Switching `/messages?thread=...` updates the recipient header but React preserves
the unkeyed MessageCentre's previous messages, draft, and pagination state. This
also happens after returning to the inbox and opening another conversation.

Give MessageCentre a key containing the account, workspace, and conversation or
draft target. A different target mounts fresh state, while a refresh of the same
target preserves the unsent draft. The change affects both customer and
professional messages without changing their markup, styling, API, or permissions.

`tests/message-navigation.test.ts` renders the real MessagesPage and MessageCentre
with isolated account/database/API fixtures. Before the fix, three of five checks
failed. After the fix, all five passed. Checks cover both workspaces, previous
message/draft removal, sending to the selected thread with its own polling cursor,
inbox navigation, and keeping the draft on same-thread refresh.

## Validation

- `pnpm build`: passed; production bundle compiled and all 75 static pages generated.
- `pnpm typecheck`: passed.
- `pnpm exec eslint src/app/messages/page.tsx tests/message-navigation.test.ts`: passed.
- Navigation, homepage, and Resend parsing tests: 12 passed across three files.
- Full baseline suite: 24 files passed and 29 failed during database setup;
  159 tests passed and 229 were skipped. This was present before the messaging fix.
- No authenticated production-browser session was used. DOM regression tests
  verify message navigation; professional layout still needs visual browser QA.

## Existing verification blocker

Most isolated PGlite databases do not provision Supabase's `anon` and
`authenticated` roles, so the full migration chain fails before their tests run.
The account-security test already provisions those roles, but then fails because
`0096_backend_foreign_key_indexes.sql` references
`beauty.booking_dispute_responses`, which has no CREATE TABLE definition in the
repository migrations. Read-only production inspection confirms the table exists
there. A temporary local bootstrap verified this second blocker; that incomplete
bootstrap was removed.

Do not mark the full suite green or run all repository migrations in production.
The repository's custom migration ledger and Supabase migration history differ.
Reconcile the missing schema history from authoritative definitions in a separate
isolated change, preserving the current financial behavior.

## Recent fixes already present

The production Resend provider-event function contains the qualified
`record_email_provider_event.provider_event_at` fix from migration 0120. The
24-hour Vercel error-log sample contained older email webhook failures; it did not
show a failure on the current deployment. A new delivery event has not been
triggered to prove live processing.

Owner search and responsive header fixes, and professional messages/Owner
navigation CSS fixes are already on main. Older open PRs include overlapping work;
compare them with current main before merging to avoid reverting newer changes.

## Next checks

1. Reconcile the isolated test schema prerequisites and missing production-only
   migration definitions without changing payment rules.
2. Visually verify professional messages in desktop/mobile and light/dark modes
   using an authorized test session.
3. Reproduce Owner/Admin navigation, search, and header symptoms against current
   production before making additional changes.

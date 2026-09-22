# glohaus

A responsive beauty discovery and appointment platform for England, using GBP and Europe/London scheduling. Built with Next.js App Router, React, TypeScript, Supabase Auth and PostgreSQL, targeting Vercel.

**Current state: substantial MVP implementation, deployed to Vercel but not ready for financial production.** The public preview works without provider credentials. Accounts, persistent professional content, bookings, deposits, image uploads and email need the provider setup below. No live money movement is enabled. Missing credentials fail closed; there is no demo authentication bypass.

## Explore the work

- [Implementation status and remaining work](docs/IMPLEMENTATION-STATUS.md)
- [Architecture, entities and relationships](docs/MVP-ARCHITECTURE.md)
- [Provider setup and deployment](docs/SETUP.md)
- [Professional profiles and verification](docs/PROFESSIONAL-PROFILES.md)
- [Product marketplace options and data model](docs/MARKETPLACE-PLAN.md)

The financial foundation uses a balanced, append-only ledger with configurable fee policies, wallet buckets and owner-only financial configuration. It does not store card details or enable customer charges, transfers or payouts until the payment provider, KYC, policies and production setup have been completed.

The home page has a browse-first, vertically scrolling inspiration feed. Professionals can publish written design/tutorial posts and portfolio photos linked to their services. The initial public preview contains clearly labelled editorial inspiration rather than fictional professionals or reviews. Video uploads and the requested product marketplace remain unfinished.

## Run locally

Use Node.js 22.14+ and the pnpm version pinned in package.json.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
WATCHPACK_POLLING=true pnpm dev --webpack --port 3001
```

Open http://127.0.0.1:3001. Set NEXT_PUBLIC_APP_URL to that exact origin when enabling accounts; localhost and 127.0.0.1 are different origins. Polling avoids macOS file-watcher limits on this workspace.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

The latest local unit/database run passes **215 tests across 18 files**. These cover account isolation, role restrictions, public visibility, booking transitions, availability across daylight-saving changes, deposit/refund rules, review eligibility, notifications, image handling, financial quote calculations and ledger isolation. PGlite exercises SQL policies locally; it does not replace independent-connection concurrency tests against the actual managed PostgreSQL deployment.

The Playwright suite currently targets missing-credentials behavior on port 3000. Authenticated provider journeys still need staging credentials and end-to-end tests. Public preview interactions have also been checked through the browser. See the status document for launch gates.

## Structure

- src/app: public and protected pages, versioned API routes, webhooks and worker endpoint.
- src/components: reusable interface and form components.
- src/modules: account, professional, post, availability, booking, payment, review, media and notification logic.
- src/lib: server identity, database transactions, access helpers and request validation.
- db/migrations: ordered, checksum-verified PostgreSQL migrations.
- tests: unit and database business/security tests.
- scripts: migration runner and audited admin/owner bootstrap.

The existing beauty-platform directory name preserves the local preview path; the product and package name are glohaus.

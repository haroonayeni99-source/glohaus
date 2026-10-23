# Node.js security update — 23 October 2026

This branch prepares the October Node.js security update. Deployments and credential rotation require the owner's separate approval.

## Runtime policy

- Use Node.js 24.22.1 for CI and local development via `.nvmrc`.
- Select `24.x` in `package.json` for Vercel. Vercel manages the exact patch release.
- CI, build, development and start commands reject Node versions below 24.22.1 and other major versions.
- Function startup instrumentation records only the Node.js version. Build-version evidence does not establish the version of an already-deployed function.
- Automatic Vercel deployments are disabled for `security/node-october-2026`. Do not merge or deploy without approval.

## Validation

On the official Node.js 24.22.1 Linux x64 binary, verified against the publisher's SHA-256 checksum:

- All 144 Vitest files passed: 1,268 application tests.
- Both runtime-policy tests passed, including rejection of vulnerable versions.
- Type checking and the production build passed.
- Lint of the new scripts and instrumentation passed.
- Repository-wide lint has three existing React ref errors in `professional-locator-map.tsx`, also present in the baseline CI run. They are outside this runtime change.
- A browser could not be installed locally because browser downloads returned invalid archives. Browser flows and real provider payment operations are not certified by these unit/database results.

Application tests use isolated fixtures and databases. No live charges, refunds, payouts, credential changes or production database writes were performed.

## Release gate

Before any approved release, verify Vercel's actual function runtime is at least Node.js 24.22.1, review outstanding dependency security findings, rerun browser and isolated provider tests, and agree a coordinated credential-rotation plan. Keep production and preview credentials separate. Never put secret values in source, reports or logs.

## Primary references

- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://nodejs.org/en/blog/release/v24.22.1
- https://vercel.com/kb/bulletin/node-js-security-advisory
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

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

- All 147 Vitest files passed: 1,277 application tests, including the final Vitest upgrade.
- Both runtime-policy tests passed, including rejection of vulnerable versions.
- Type checking, production build and whole-repository lint passed (two existing image warnings).
- Production dependency audit has no known advisories. The full audit retains one lint-only braces advisory without a published upstream patch; it remains documented and visible.
- The production-server browser suite passed all 48 checks, including enforced CSP and injected-script rejection. Map/browser results and release limits are recorded in the delivery report.
- External provider payment/authentication checks require isolated test resources and are not certified by fixture/database results.

See [the application remediation notes](security-remediation-20261023.md) for dependency, TLS, CSP, upload and webhook-overlap changes prepared with this runtime update.

Application tests use isolated fixtures and databases. No live charges, refunds, payouts, credential changes or production database writes were performed.

## Release gate

Before any approved release, verify Vercel's actual function runtime is at least Node.js 24.22.1, review outstanding dependency security findings, rerun browser and isolated provider tests, and agree a coordinated credential-rotation plan. Keep production and preview credentials separate. Never put secret values in source, reports or logs.

## Primary references

- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://nodejs.org/en/blog/release/v24.22.1
- https://vercel.com/kb/bulletin/node-js-security-advisory
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

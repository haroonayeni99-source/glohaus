# Security remediation prepared on 23 October 2026

Deployment and live credential rotation remain subject to the owner's explicit approval.

## Changes

- Retain Node 24.22.1, patch-floor enforcement and disabled automatic deployment for this branch.
- Pin Next.js and its lint configuration to 16.4.2, Sharp to 0.35.5 and MapLibre to 6.4.1. Override source-map-js to 1.2.2 and commit the updated lockfile.
- Serve MapLibre's matching ESM worker and relative chunks locally. Generate these assets from the locked package during build/development and UI checks.
- Require verified TLS for both application and payment database connections. Remove connection-string SSL overrides before constructing pools. Application TLS accepts DATABASE_CA_CERT, falling back to PAYMENT_DATABASE_CA_CERT and then the system trust store. Check the actual database certificate chain before release; no production connection credentials were copied or live configuration changed.
- Add a fresh script nonce and enforced Content Security Policy to rendered pages; preserve API/webhook bodies, cookies, canonical redirects, maintenance behavior, media, maps, secure provider connections and inline styling.
- Reject unsupported upload signatures before passing bytes to native image decoders.
- Add optional STRIPE_WEBHOOK_SECRET_PREVIOUS and STRIPE_CONNECT_WEBHOOK_SECRET_PREVIOUS overlap slots. They do nothing until an approved rotation explicitly configures them.
- Add a tracked-source Stripe credential-pattern check that reports filenames without matching values.
- Fix map callback ref assignments during render and bound professional photos to their existing grid column so they cannot cover service links.

## Validation

Local Node 24.22.1: 147 Vitest files and 1,276 tests pass, plus two native runtime tests. Production build and lint pass (only the two existing loading-logo image warnings remain). Production-dependency audit reports zero known advisories. Real production-server HTTP checks confirm nonce-matched scripts on Home, Explore and Sign-in and a correctly served map worker. GitHub browser results are recorded in the delivery report.

These are fixture/database/browser compatibility checks, not live payment certification. No production charges, refunds, payouts, migrations, secret-value reads, credential rotations, Vercel environment edits or deployments were performed.

## Release gates requiring separate approval

1. Confirm Vercel's actual function runtime is patched, then authorize a deployment of the reviewed commit.
2. Verify the real application's database TLS certificate chain with its configured CA. Do not disable verification to work around a failure.
3. Reclassify DATABASE_URL and BLOB_READ_WRITE_TOKEN as Secret using metadata-only updates where supported. Isolate production Blob access from preview/development resources. No values belong in this document.
4. Coordinate API credential and both endpoint-signing-secret rotations after the environment is secured. Use the optional previous-secret slots only during the agreed overlap; retire them and any obsolete database fallback values afterward.
5. Run isolated provider end-to-end checks and the agreed phone checks. No live financial smoke transaction is authorized by this branch.

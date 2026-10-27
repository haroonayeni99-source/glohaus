# Calendar subscription readiness

This follow-up extends the business-tools release from PR #175. Calendar OAuth and automatic social imports still require the platform's own approved developer apps; connected personal Calendar tools do not supply credentials for an app used by other professionals.

## Complete-path checks

`tests/calendar-sync-database.test.ts` exercises the real store/sync/worker functions, encryption, complete repository migrations and PostgreSQL permissions in a disposable database. The ordinary cases simulate the external feed only. They cover imports, repeated imports, reschedules, cancellations, manual-block preservation, outages, connection ownership, an in-flight disconnect, the eight-connection limit, every connected calendar at checkout and the scheduled worker's routing.

The original per-function tests did not execute the bulk import query. The complete-path test found that the JSON recordset column `end` needed SQL quoting. The importer now quotes both time fields. The connection cap uses the professional lock, and a disconnected connection is no longer counted as a successful import. Booking preflight refreshes up to all eight permitted connections and compares their success timestamps with the database's own start timestamp, avoiding a fixed 15-second expiry of the first calendar during a longer multi-calendar refresh.

`tests/calendar-feed-transport.test.ts` verifies pinned DNS, rejecting mixed private/public addresses, HTTPS/TLS defaults, use of a private agent rather than the global proxy agent, redirect rejection, the response-size limit, aborted streams and socket errors. Application TLS verification is not disabled.

## Optional real-network smoke check

Run this from a deployment/build environment with normal public DNS and HTTPS access:

```
GLOHAUS_PUBLIC_FEED_SMOKE=1 pnpm exec vitest run tests/calendar-sync-database.test.ts --maxWorkers=1
```

Only the opt-in case makes a real network request. It uses the fixed, public GOV.UK England-and-Wales bank-holiday feed, never a professional's private link. It imports that response into the isolated fixture database through the real synchronisation path. No production users, bookings, reviews, payments, OAuth accounts or email are created. This is not a signed-in professional's personal-calendar test.

The workspace's direct DNS cannot resolve the GOV.UK host (`EAI_AGAIN`). Retrieving the public file through the permitted proxy succeeds, but that does not exercise the DNS-pinned application downloader. Do not weaken the downloader or substitute proxy-based fetching to claim that the application's network path passed. Run the opt-in check in the deployment environment and record its actual result.

## Activation

Create a new independent `BUSINESS_TOOLS_ENCRYPTION_KEY` as a production-only managed secret after the transport/sync checks pass. Never copy this value into code, previews, browser props, logs or a report. Preserve it while connections exist; rotating it requires a deliberate migration/reconnection plan.

The key enables read-only supported ICS subscriptions. Google, Outlook, Instagram and TikTok remain independently disabled until their respective approved app credentials and explicit enable flags are configured. Keep their real-account consent/revocation/expiry tests as separate release gates.

Professionals reach subscriptions through **Business Tools → Connected calendars → Subscribe using an iCal / ICS link**. Use a private subscription link supplied by an existing calendar/booking platform and authorised for that professional. GLOHAUS imports busy times; it does not write into an ICS feed or expose appointment names. Check the connection's successful-sync time. Stale or failed connected calendars pause booking slots until they recover or are explicitly disconnected.

After activation, an authorised professional still needs to confirm a private-feed connection, a blocked slot, a moved/cancelled external appointment and disconnection through the production dashboard. Real provider account connections, real review-photo upload, Safari and physical-device verification remain separate from these tests.

References: https://www.gov.uk/bank-holidays and https://r2.nodejs.org/docs/latest-v24.x/api/https.html .

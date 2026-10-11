# Public location and Search Console QA — 11 October 2026

## Delivered behavior

- Professional Profile includes an optional public map-pin editor. A UK business postcode lookup finds an area centre; the professional must choose a studio pin and explicitly confirm public display. Device location is offered only on request, with an accuracy guard. Publishing, changing, removing and retrying a failed load have clear results.
- Confirmed pins use actual latitude/longitude on an interactive street map. Missing pins retain area-only discovery without invented distances. The location label is **professional-confirmed**, separate from identity verification.
- Explore offers a bounded distance radius and nearest-first results across the full matching directory. All existing service, area, price, rating, travel, verification and today filters apply before the 100-result cap. Capped searches explain how to narrow them. Distances are approximate straight-line miles, not route or travel estimates.
- Visitor coordinates travel only in a same-origin, uncached POST body, are not stored, and never enter URLs or cursors. Clearing a location invalidates pending callbacks and searches. Denied, coarse or failed location searches preserve normal browsing.
- Street tiles load only after a user asks for them, with visible OpenStreetMap attribution and privacy information. Tests mock tiles, geocoding and all mutations; they make no external map requests.

## Data boundaries

The additive `professional_confirmed_locations` migration creates an empty table with forced RLS and explicit owner read/insert/update policies. Its public projection is owned by the existing restricted `beauty_catalog` role and exposes only consented pins for published, active profiles. No roles, existing tables, financial rules, secrets, booking-location sessions or production records are changed. Removing a pin clears its coordinates rather than deleting any profile or business data.

Production verification: table has zero records, RLS and FORCE RLS are enabled, four policies exist, restricted catalogue owns the view, zero public pins. Supabase security advisor findings are unchanged; there are no new location findings. The management connection cannot assume the runtime `beauty_app` role, so runtime behavior is verified through the deployed public API as well as isolated RLS tests rather than expanding management permissions.

## Verification

- 596 tests across 68 files, including real database ownership, consent, visibility, coordinate constraints, global nearest ordering beyond the first directory page, radius and combined-filter checks, and route failure/privacy checks.
- Lint, TypeScript and production build pass.
- 36 desktop/mobile production-mode browser regression cases pass.
- Eight complete public-pin/Explore journeys: light and night at widths 320, 390, 768 and 1440. Includes postcode area to confirmed pin, disabled publication before confirmation, publish/remove, device pin, failed-load retry, accurate distance sorting, radius filtering, no coordinate URL, map links/controls/attribution, clear-location race, server failure, coarse device position and denied permission. No horizontal overflow or browser errors.
- New location journeys run in the existing foundation CI after browser tests.

## Google Search Console

The `glohaus.shop` Domain property was automatically verified in the owner's Google account through the existing domain-provider DNS verification. Authoritative DNS remains GoDaddy; no DNS or nameservers were changed.

`https://www.glohaus.shop/sitemap.xml` was submitted and Google displayed the submission confirmation. Its initial report still says **Couldn't fetch**, including after one retry. Direct anonymous HTTP requests, including a Googlebot user-agent diagnostic, return HTTP 200, `application/xml`, and a valid seven-URL sitemap. Robots points at that exact sitemap, and Vercel shows no sitemap runtime failures in the investigation window. Submission is confirmed; successful Google sitemap processing is not yet confirmed. Following Google’s recommended diagnosis, Search Console’s live URL test successfully fetched the exact sitemap at 06:44 UK time: Crawl allowed = Yes, Page fetch = Successful, Indexing allowed = Yes. This confirms Google can reach the file; the sitemap report still needs to reflect a successful processing cycle.

Google accepted priority crawl requests for the homepage and Explore. The homepage's previous index record was from 3 October and excluded it for the old `noindex` tag; current public pages have indexable canonical metadata. Crawl requests do not mean pages are already indexed. Recheck the sitemap status and indexing reports after Google's next processing cycle; avoid speculative routing/firewall changes without a confirmed failure.

No production test pins were invented or backfilled. Real professionals must confirm their public studio pin before distance search can include them.

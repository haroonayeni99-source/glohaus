# Supabase bandwidth reduction

## Provider baseline and daily measurement

On 25 October 2026 the authenticated Supabase Usage dashboard showed **6.886 GB uncached egress** for the organisation and production Glohaus project in the **21 October–21 November** billing period (5 GB included). Cached egress displayed 0 GB at summary precision. Provider usage can lag by one hour. The dashboard shows a grace period ending 24 November; reducing the new daily rate does not erase bandwidth already consumed.

A daily morning check is scheduled to read the provider byte totals, compare completed days or comparable cumulative observations, handle billing-cycle resets and report loss of access. Query counts and estimated JSON sizes are diagnostic evidence, not billed bandwidth measurements. No realised savings are claimed before a comparable post-release measurement exists.

## Targeted changes

- Explore, Discover and Share reuse an anonymous, active public category catalogue for five minutes. Admin category/product-category/taxonomy edits invalidate the cache immediately after the existing authorised transaction succeeds. Failed fills propagate to existing error/retry handling; simultaneous cold fills within one instance share a single request. Private, inactive/admin catalogues and professional selections remain outside this cache.
- Ordinary listings already display 24 professionals per page. Postcode pages now request 25 rows (24 plus a lookahead) instead of fetching up to 101 and discarding most of them. The independent nearby-map endpoint keeps its existing closest-100 cap and disclosure so map coverage is preserved.
- Discovery area/filter/profile links and pagination no longer prefetch pages before a visitor chooses them. Explicit search still works normally, and typing in the local list filter makes no database request.
- Identical in-flight nearby searches are suppressed; replaced/cleared searches and unmounted components abort the previous browser request. Already-running server queries may finish; client cancellation is not represented as guaranteed database cancellation.
- No shared caching is applied to authentication, account data, bookings, professional visibility, availability, verification, wallets, financial quotes or financial events. All existing server permission checks and checkout revalidation remain in place.

## Validation project and testing

The isolated project `rqsyakggwmpkqzzogvll` contained zero bookings, zero payments, zero Auth users and zero application connections when reviewed. Its migration validation was finished, and this optimisation adds no schema migration. It was paused on 25 October 2026 and confirmed INACTIVE; nothing was deleted and production `tyycrmmczsgnowditnii` remains ACTIVE_HEALTHY.

Further tests use disposable local PGlite/native CI data and browser fixtures, never a repeated production test matrix. The existing hosted browser jobs run against isolated fixtures. Focused cache/query-bound, discovery, location, ranking and taxonomy tests passed (83 assertions); lint, type-check and a clean production build passed locally. Hosted CI gates deployment.

## Rollback

The preceding fairness release is commit `110274b6cffde501bba6172ebbc752500673e983`, production deployment `dpl_EtJdFGvDtsR9dj2Mwy6XVPWy3KAE`. Re-promote it for a material regression. No database rollback, financial edits or validation-project restoration are required for this optimisation.

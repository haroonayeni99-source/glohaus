# Beauty discovery map and category controls

The Explore release extends the existing OpenStreetMap component, public location consent, service/speciality catalogue, calendar, public profile/media views, verified reviews, Following records and Owner/Admin MFA boundary. No mapping provider, payment flow, booking writer or financial rule is replaced.

## Customer journey

- `/explore`: results occupy 42% and the interactive street map 58% on desktop. Mobile uses a persistent List/Map switch and the existing theme preference (including automatic appearance).
- Category chips come from the existing active, canonical service categories. Exact category/speciality/service, date, price, rating, verification, travel-to-customer and location filters retain real catalogue semantics.
- Pins show the starting price of matching services. Clicking a pin selects the corresponding result and opens its price/availability summary. Map panning and zooming retain keyboard/button alternatives. Search this area uses the current viewport centre/radius through the existing nearby POST API.
- Geolocation is optional and ephemeral. Only professionals' confirmed public pins appear. Area-only professionals remain in regular results; no home addresses or estimated business coordinates are invented. Distance is straight-line distance, and nearby results are bounded to 100 records.
- Cards use a published portfolio photo when available, then the existing profile photo. Ratings/counts come from completed-booking reviews. Promoted results remain labelled. Next-slot hints use existing working hours and authoritative busy intervals, with the existing one-hour lead and 90-day horizon. The hint searches 14 days from the chosen date; actual booking/options are rechecked by the existing reservation flow.
- Quick View lazily retrieves public services and published image/video portfolio assets from `/api/v1/explore/professionals/[slug]`. Private contact preferences, booking notes and customer data are excluded. Videos have explicit controls.
- Hearts persist through the existing authenticated Following system and are available in Account → Following. No parallel favourites table is introduced.

## Owner and professional controls

- Owner/Admin → Service Categories (`/admin#categories`): retain existing category, speciality, service-template, alias and visibility controls. Explore chips now reflect those saved records.
- Owner/Admin → Product Categories (`/admin#product-categories`): add/edit/rename/order/show/hide marketplace categories, with an audit record and the existing MFA/role checks. Category names/IDs use `beauty.platform_categories`; product visibility/order are independent of service visibility/order. Product-only categories start hidden from service browsing.
- Hide removes a category from Shop browsing and new assignments. Existing products, booking/order history and assignments remain intact; products remain available in Shop all. Re-enable restores category browsing.
- Professional → Products & stock: choose a category for each product. Existing products start uncategorised and are never guessed into categories. Their price, stock and publication/verification rules are preserved.
- `/shop?categoryId=...` filters actual category assignments, independently of search and Bestsellers/Trending/Deals/New arrivals. Hidden category IDs do not expose a category listing.

## Migration and release

Additive migration: `20261016055813_discovery_map_product_categories.sql`, created with Supabase CLI and moved into the established repository migration directory. It adds product flags/order to the existing category catalogue and a nullable indexed category FK on products, plus guarded Admin and public availability helpers. Public products retain their existing view owner/RLS/account-visibility boundary. No new table or runtime secret is needed.

Apply only this migration after source review and passing checks, using the established bounded transaction/checksum ledger. Preserve the already configured notification VAPID keys. Do not replay historical migrations or create extra previews. OpenStreetMap attribution, browser caching, privacy consent and visible-viewport-only tile requests are retained; browser tests intercept all tile requests.

## Verification evidence

- Isolated migrated-database tests cover verified Admin permissions/audit, shared category IDs, exact assignment filtering, remove/restore semantics, unchanged product availability/history, cross-account relabelling denial, working hours/blocked-time slot hints and function grants.
- The real Quick View handler is exercised against the isolated database; private contact fields are excluded and unpublished profiles return 404.
- Browser script `scripts/check-discovery-map.mjs` covers 320/390/820/1440px in light/night themes, persisted saves, public photo/video Quick View, service booking links, price-pin selection, the desktop split, viewport search, category creation/edit/hide/restore, product assignment and no horizontal overflow. It uses explicitly isolated records and intercepted APIs/tiles; no production account or provider is mutated for those checks.
- Existing location-editor and nearby-search journeys, including denied/imprecise geolocation and stale requests after navigation, remain regression targets.

## Production release record

Released after the owner requested deployment and addition of this production feature. PR #119 merged at `45693cc2428f6d70080bb7fbbf6a77b6079f9e89`. Deployment `dpl_29TVRWoqEeWJKNNj2riB54GqsfZb` is READY at https://www.glohaus.shop/explore and the existing custom domains are assigned.

- Final feature-commit Verify GLOHAUS CI passed lint, TypeScript, all **1,048 tests in 116 files** and the production build. Eight expanded map browser cases passed in CI. Eight existing location-editor browser journeys passed locally.
- Applied only the additive migration with its SHA-256 entry in the established ledger. Post-migration counts remain **11 bookings, 11 payments, 8 financial ledger entries and 1 product**. The public product view retains owner `beauty_catalog` and its account-visibility gate. The new helpers are not executable by anonymous/authenticated Data API roles. No new advisor notice names appeared.
- Live browser verification reached the new Explore layout, loaded real OpenStreetMap street tiles, and confirmed Shop category links carry actual category IDs. The immediate production error/fatal log scan was empty.
- Production currently has **0 published professionals, 0 published services, 0 confirmed public pins and 0 publicly listed products**. Publishing and public-pin consent remain the professionals' explicit actions. Existing private records were not published or fabricated for verification.
- A test-only follow-up supplies product-category fixture data to the existing Owner/Admin browser harness, keeping server-only database code outside its isolated browser bundle. Navigation search now checks that both Service Categories and Product Categories remain accessible. This does not change production functionality.

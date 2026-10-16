# Original Explore map and London borough discovery

Restores the original dark hero, neighbourhood-card styling and illustrated London map, using the earlier approved map markup rather than the tilted renderer. The 32 borough cards and accessible borough selector retain current category, service, date, rating and price filters. The City of London remains searchable as an area and is not counted as a borough.

The existing working discovery results, saved professionals, service deep links, Quick View, booking links and Google Maps directions are retained. Each professional with a valid, explicitly confirmed public business location has a **Show on map** action. It switches the mobile view if necessary, centres the standard street map on that exact published coordinate and selects street-level zoom. Street tiles retain the existing explicit OpenStreetMap loading/privacy choice. Professionals without a public pin stay area-only; no coordinates are inferred from an address or borough.

Borough filtering runs in the existing server query, before pagination or distance limits. Confirmed public coordinates are tested against a borough outline using PostgreSQL's built-in polygon type. A confirmed point outside the borough cannot match through misleading profile text. Area-only profiles can still match an explicitly written borough name, but are never shown as pinpoint locations. Ordinary neighbourhood and City of London searches retain the existing text matching. No migration, PostGIS extension, private-location query or financial rule change is required.

## Public boundary source

Greater London Authority / Ordnance Survey Open Data, London borough boundary layer:
https://gis.london.gov.uk/arcgis/rest/services/apps/Air_Quality_map_service_01/MapServer/0

Retrieved 16 October 2026 with `where=1=1`, `outFields=name,gss_code`, `outSR=4326`, `f=geojson`. All 33 administrative outlines returned as single-ring polygons. City of London was excluded from the borough catalogue. Rings are simplified by a maximum angular tolerance of 0.00005 degrees and rounded to five decimal places for discovery; these indicative boundaries are not intended for legal/address verification. The JSON is server-only; it is not bundled into the Explore client.

Contains public sector information licensed under the Open Government Licence v3.0. Contains Ordnance Survey data © Crown copyright and database right. Source attribution is retained with the dataset and this release note.

## Verification

- Real migrated-database regression: a Peckham public pin matches Southwark despite its neighbourhood label; a Brixton pin does not match Southwark even when its profile claims that borough; it matches Lambeth. Existing service filters remain applied.
- Borough catalogue: 32 distinct boroughs, case-insensitive selection, no accidental City of London counting, ordinary area search retained.
- Browser checks: original overview; 33 selector options including All London; genuine selected pin coordinates and street zoom; area-only restriction; mobile view switching; filters, saves, Quick View, directions and booking deep links; desktop map-first layout and no overflow at 320/390/820/1440px in light/night modes.

No production or preview deployment is created by this change. The working branch disables automatic Vercel deployment.

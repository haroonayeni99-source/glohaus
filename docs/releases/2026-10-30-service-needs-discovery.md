# Service, style and stated-needs discovery

Reuse the approved discovery page, map, cards, taxonomy resolver, filters and booking links. For free-text terms not already resolved by the taxonomy, match published service descriptions, categories/specialities, and individual active public options/attributes as well as service names. All query words must match the same service/option context; incompatible option words are not merged. No private notes, inferred health claims, or inactive/draft options are searched.

A matching option must satisfy the selected price cap itself; an expensive variation cannot pass through a cheaper base-service price. Cards retain existing service-level From prices and service-level availability previews. Exact option prices, duration, availability and policies are selected and confirmed in the existing booking flow. No pricing or booking rules change.

Verified: 35 database tests across discovery and multi-speciality suites passed, including five new description/style/publication/price-boundary checks. TypeScript, targeted lint and production build passed. Exact SQL compiled with EXPLAIN on isolated hosted staging; this is not a hosted authenticated UI test or a production-scale performance benchmark. Final-head CI remains pending. No database migration is required.

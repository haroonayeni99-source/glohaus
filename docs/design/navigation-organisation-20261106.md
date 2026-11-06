# GLOHAUS navigation and communications refinement — 6 November 2026

## Audited baseline

Production source `a753612d63fc7eac0350223370fadfc9dc5cd897`, glohaus1 deployment `dpl_FJAYHxhP9o6o9wkrHR7KMbicRoWV` (READY). The earlier homepage, floating appearance and optional entry-loading work stays intact. Route inventory contains 81 implemented page sources, including dynamic route templates. API routes are deliberately outside this presentation inventory. Dynamic links and role checks remain in source.

Open PR review found unrelated academy, referral, Founding notice, authentication and refund/fee work. None is merged or activated by this release. Their financial/schema/backup release gates remain unchanged.

## Consolidation decisions

| Existing experience | Overlap / decision | Desktop and mobile behaviour | Risk and preservation |
| --- | --- | --- | --- |
| Marketing preferences + phone notification settings | Merge presentation into Notifications & Communications | Shared section navigation; existing alert/device controls and optional email marketing form | Same save APIs, consent fields, identities and records; independent load failures show alerts rather than invented defaults |
| Notification inbox | Keep separate from preferences | Explicit inbox link from settings; settings link from inbox | No activity records or read/unread behaviour changed |
| Discover, Saved, following feed | Group with persistent collection navigation | Wrapping touch-friendly links, same existing query URLs | Saves and followed content stay separate; no feed queries or data rules changed |
| Followed professionals | Connect to Discover but keep profile directory | Dedicated collection link; existing account deep link and compact account shortcut | Followed profiles are not conflated with posts; existing role guard retained |
| Find a Professional | Keep direct search/map separate | Link alongside Discover collections and existing public menu | Map, filters, boroughs, categories and search logic untouched |
| Customer bookings/history | Preserve already-live combined Bookings entry | Existing tabs and booking links | Booking/payment code untouched |
| Customer account | Keep bookings/purchases, community/ideas and settings groups; reduce prominent social/settings duplicates | Discover collection panel plus secondary saved/followed shortcuts | Invite Friends, Feature Votes, security, orders, wallet and reviews retained |
| Professional tools + Business Hub | Group into seven business tasks; make Hub accessible | Overview, appointments/clients, services/portfolio, selling, finance, growth, settings; wrapping jump links | Every old tool remains, including fallback group for future entries; adds links only to existing operational pages |
| Professional mobile menu | Group existing links with native disclosures | Business overview open; other tasks expandable | No hidden role actions, routes or rules removed; primary five-item bottom bar retained |
| Business Hub reporting | Keep reporting intact, add professional shell | Same insights inside existing professional navigation | Financial calculations, invitations and reporting queries unchanged |
| Owner/Admin tools | Eight task groups around existing IDs | Existing search, jump selector, disclosures, active section and deep links | Every previous section occurs exactly once; owner-only filtering and access unchanged |
| Shop / Marketplace | Keep Shop for navigation and Marketplace for wider identity | Existing catalogue and checkout kept | No product/financial workflow changes |
| Theme, PWA and loading | Preserve previous approved release | Floating Light/Night/device control, delayed in-flow install prompt and entry-only branding | No new theme/loading behaviour in this release |
| GLOHAUS Together / rewards / academy activation | Keep distinct; no invented functionality | Existing routes retained where already present | No new financial commitments, production migrations, rewards or social-sync activation |

## Shared visual direction

Shop and Discover remain the reference: rich berry/pink accents, ivory/charcoal themed surfaces, photography and substantial cards. This release adds reusable scoped section navigation, rounded workspace groups and premium communication-setting panels. It does not introduce a minimal replacement website. Existing shared brand, loading and theme placement are preserved.

## Release gates and rollback

No SQL migrations, writes to customer records, payment/API code, auth rules, environment settings or financial configuration are part of this diff. Automated tests cover consent read preservation, independent settings failures, correct audience/identity, complete Admin tool coverage and distinct Discover destinations. Existing marketing/notification suites verify unchanged save behaviour.

Preserve `restore/before-navigation-organisation-20261106` at baseline a753612 before publishing. Selectively revert this navigation release or roll back to dpl_FJAYHxhP9o6o9wkrHR7KMbicRoWV. Do not restore a database or overwrite later unrelated fixes. Earlier pre-visual restore branches remain available. No new Owner runtime toggle is added: that would require new persisted configuration and permissions for a cosmetic release; Git/Vercel rollback provides the reversible path without that expansion.

Physical Safari/Android and installed-PWA verification cannot be inferred from desktop viewport checks. No real payment, consent change, push registration or message send is required for navigation verification. Report physical-device and independent role-account checks explicitly if unavailable.

## Validation before release

- 39 focused communications/navigation/theme/loading/PWA tests passed.
- 141 access, Admin financial-contract, checkout-resume, Shop-checkout and professional-plan regression tests passed.
- TypeScript and targeted ESLint passed; complete webpack production build passed.
- Component browser checks: 320/390 px menu/settings, 1260 px desktop, light and night, with no horizontal overflow in the checked views. Desktop shortcuts reduced to Business Hub/Seller Hub after finding clipped account controls; policies, orders and verification remain available in Tools/menu.
- No production preference, device, booking or payment write was made during verification. Real-device PWA and independent customer-only/professional-only accounts remain distinct verification limits.

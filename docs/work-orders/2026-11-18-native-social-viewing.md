# Concept C — native GLOHAUS social viewing

Owner instruction received 18 November 2026. Extends the existing authorised work order; implementation belongs in #242 and is coordinated with unified management #233 through common acceptance candidate #245.

## Required behaviour

1. Show existing authorised TikTok/Instagram thumbnail previews in the professional Our Work grid.
2. Open the selected post in the existing full-screen GLOHAUS portfolio viewer.
3. Use provider embedded players or an explicitly authorised media method. Never scrape, download or proxy provider video files to simulate native playback.
4. Keep the top-level visitor on GLOHAUS during normal playback. Never automatically redirect to a provider.
5. Preserve provider play/pause and sound controls where supported, plus GLOHAUS previous/next, close, Escape and browser Back.
6. Offer an optional View on TikTok / View on Instagram link opening separately, with source attribution retained.
7. Request no provider player until the visitor selects the post and explicitly agrees to load that provider. Only one selected player is mounted. Unload it on navigation/close.
8. Preserve responsive layout, initial loading performance and existing privacy/publication/consent rules.
9. For private, deleted, restricted, non-embeddable or unavailable posts, retain the thumbnail and a clear external option. No prohibited playback fallback.
10. Public provider integrations remain disabled until provider approval and production readiness checks are genuinely complete.

## Acceptance and evidence boundaries

A visitor opens a professional profile, selects a supported TikTok or Instagram video, loads it after consent, plays it within the GLOHAUS viewer, closes it and continues browsing the same professional profile without top-level navigation.

Test separately: (a) component security/state/consent, (b) browser fixture integration and responsive layout, (c) genuine provider playback in isolated hosted Preview, (d) production release and post-deployment smoke. Provider-frame fixtures are not provider approval or proof of genuine playback. Instagram iframe load is not proof that a video played. Never label these acceptance stages interchangeably.

## Implementation and remaining dependencies

#242 now uses a dedicated selected-post player instead of inserting the entire Discover card into the full-screen viewer. The existing allowlisted Instagram embed URL and documented TikTok embed player are retained; URL parsing canonicalises providers and rejects cross-provider/unsafe URLs. Provider native controls remain visible. Sandbox excludes top-level navigation. Errors/timeouts give truthful recovery and manual original links; no media extraction or global provider script is introduced. Discover is unchanged.

Public provider flags remain unchanged/OFF. Genuine hosted/provider acceptance follows the existing isolated database configuration, provider restrictions and authorised test-account availability. Complete all independent tests and integration work while those remain unavailable.

References checked 18 November 2026:
- https://developers.tiktok.com/doc/embed-player (player route, controls and origin-scoped message protocol).
- https://developers.facebook.com/docs/instagram-platform/oembed/ (provider embedding limitations: private, age-restricted, disabled-embed accounts and Stories are unsupported).

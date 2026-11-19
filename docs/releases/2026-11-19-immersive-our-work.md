# Concept C immersive viewing

Preserves the live three-column 9:16 grid and Discover. All Work remains the default across eligible uploaded photos/videos, manual social links and published Instagram/TikTok sources; unavailable/draft/hidden sources remain excluded by existing public views and component guards. Removes the profile's arbitrary 100-upload query cutoff, while preserving server eligibility and publication settings.

Selected uploaded videos attempt muted inline playback, with accessible surface/button pause/resume, separate sound, rejected-autoplay fallback and teardown before navigation. Photos share the same viewer without video controls. Vertical touch, wheel/trackpad and keyboard navigation use one selected item, short directional transitions and a quiet-period wheel guard. Closing restores the original scroll/focus. Reduced motion disables transitions and automatic playback. At most the next safe first-party preview gets a prefetch hint; no provider iframe is prefetched.

Social consent remains required per selected post. TikTok uses documented player parameters and origin/frame-checked play/pause/mute messages; autoplay rejection 3002 retains an accessible Play control. Instagram retains supported embedded/native controls without unsupported custom controls. Iframe input cannot bubble across provider origins: a narrow side gesture rail keeps vertical navigation available without covering provider controls. Originals are optional external links; no automatic redirects or scraped media.

Authoritative provider references:
- https://developers.tiktok.com/docs/en/embed-player
- https://developers.tiktok.com/docs/en/embed-videos (official autoplay/muted embed example)

Uploaded work can book an existing service already associated through its public service image; social work retains existing named-service links. No service associations or booking/payment rules are changed. Existing management controls and #245 collection/pin/order development remain the single management system; do not overwrite this viewer when integrating that candidate. New pair metadata and genuine hosted management acceptance remain separate development, not a reason to block this display release.

Release gate: Preview enables immersive behaviour; production requires OUR_WORK_IMMERSIVE_ENABLED=true or an exact OUR_WORK_IMMERSIVE_TEST_SLUGS entry. Explicit false disables it. Provider connection flags and schema are unrelated and remain unchanged. Canary existing GLOHAUS Test Studio uploaded videos using real decoding/playback and touch/wheel/keyboard/close/scroll before wide rollout. Genuine social provider/account acceptance remains subject to approvals/consent; mocked provider frames are labelled fixtures.

Initial validation: 21 focused component/provider/rollout tests pass; lint and TypeScript pass. Browser workflow uses a genuinely decodable local MP4 and provider fixtures across mobile/desktop and light/night; additional reduced-motion case. Build and exact-head CI pending at this checkpoint. No production activation claimed yet.

Rollback: preceding verified main aeab270 / glohaus1 dpl_7yNrBSKXFdGF1PSju5GqhH6vGLcs. Feature kill flag needs a new deployment; promote previous verified deployment for immediate rollback.

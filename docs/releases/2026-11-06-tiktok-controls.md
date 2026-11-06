# TikTok controls repair — 6 November 2026

Production baseline: a401563f04f25a9b55f4374b549f067a5dc6c093. Existing project haroon-glohaus/glohaus1 only.

## Evidence and cause

Live professional connection page showed an authorised TikTok connection and one eligible video imported into a GLOHAUS draft. Clicking the existing Sync now control successfully advanced last_success_at and returned the generic Saved message. No application JavaScript exception was observed during that check. A successful connection alone was not taken as import proof: the draft and successful explicit refresh provide separate evidence.

Confirmed feedback defects: action results lived at the top of a long page, not beside the scrolled controls; pending buttons did not explain progress; a zero-work sync misleadingly reported Saved. Imported removals intentionally hide rows, but uncontrolled selects retained their previous default after a server refresh, making the changed state appear stale. These are verified defects; no universal claim that all reported clicks failed for the same reason.

The connected professional profile currently has no public slug. Public profile/portfolio visibility therefore remains blocked by profile setup. No slug, business details or publication choice was invented. One imported video stays private, and the account remains in Approval Mode.

## Changes

- Visible, dismissible, accessible action feedback remains in view while scrolling; safe-area spacing and bounded width.
- Immediate duplicate-request lock and disabled controls during request/route refresh.
- Request timeout with instructions to check whether a write completed before retrying; network/session/access/form/non-JSON errors explained without provider response bodies.
- Successful, failed and zero-work refresh messages distinguished; refresh copy explains public videos versus TikTok drafts and the separate Publish/Save step.
- Remove explains hidden imported rows and later-sync preservation. Reconciled form keys reflect refreshed publication/order/service/feature and connection settings.
- Read-only profile readiness indicator and existing profile editor link explain why imported work may not be public.

No OAuth credentials, database schema, payment rules, permissions or integration connections changed. No new social integration built. Current same-origin, professional ownership, encrypted credential storage, source reconciliation and public-visibility rules remain in place.

## Tests and limits

55 tests across five files passed: business-connections-ui, tiktok-sandbox, tiktok-disconnect, social-portfolio-flow and business-tools. Coverage includes HTTP save payloads, draft-to-hidden form reconciliation, pending/duplicate prevention, expired session, timeout/network/non-JSON response, skipped/failed sync, existing API/SQL ownership, public visibility, source unavailability, hidden-choice preservation, provider failures and sandbox identity/refresh rules. TypeScript and scoped lint pass; production webpack build checked before release.

Live observed: existing authorised test account, successful explicit video refresh, one imported private draft. Actual disconnect/reconnect, token expiry, missing provider permissions and failure states are isolated tests, not destructive live exercises. Token values were never read or printed. Actual iOS/Android installed PWAs, physical touch/keyboard layout and public TikTok embed playback remain unverified. Public display awaits completion/publication of this professional profile and an explicit post-publication selection. No promise that TikTok app approval or general production automatic sync is complete.

## Release and rollback

Publish only the scoped three source files, UI regression test and this report atop the exact baseline. Preserve a restore branch at the baseline; selectively revert source or restore the previous deployment without resetting data. Production deployment health and scoped button observations are reported separately after deployment.

Analytics is a separate blocked workstream: production Free plan dashboard confirmed no managed backups and an over-quota restriction warning for 24 November. No analytics activation or paid upgrade performed by this repair.

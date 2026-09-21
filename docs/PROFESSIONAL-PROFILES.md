# Beauty Professional profiles

## Implemented workflow

After verified professional enrollment, open /professional/profile. Edit the business/display name, profile URL, short bio, city, optional public location details, business description, preferred contact method, business contact email/phone, Instagram, TikTok and website links. Save as a draft, publish, or hide the profile. Opening hours and holiday controls are linked from the editor; portfolio management is separate. Services and prices remain editable on the same page.

The business/display name is the public brand; the private account display name remains separate. A business email or phone number appears publicly only when selected as the preferred contact method. It is never automatically copied from the private sign-in account. Social links supplied by the professional are public. The editor explains these choices.

The public /p/[slug] page contains a profile photo or initials fallback, name, bio, location, real visible-review average and count, description, contact/social links, portfolio, services/prices, opening hours and availability. The Book button scrolls to the existing booking widget. No new payment functionality was added in this task.

## Photos and validation

Profile photos use a dedicated one-photo-per-professional table. They are not silently inserted into the portfolio. Upload and replacement accept JPEG/PNG/WebP up to 3 MB, bound decoded pixel count, strip metadata, correct orientation, resize and encode WebP. Files use random paths in PRIVATE Vercel Blob storage. Uploaded photos become public only with a published, active professional profile. Replacing/removing a photo revokes its old media URL; obsolete objects are deleted best-effort, with cleanup failures logged without private details. Ongoing operational orphan cleanup remains a deployment concern.

Profile photo routes use the verified professional ID from the account. PostgreSQL RLS protects records and restricts cross-account reads and changes. Public views follow publication/account status and expose only selected business contact fields. The image proxy uses no-store responses and checks public visibility or authenticated ownership on every request.

Server validation bounds fields, rejects forged owner properties, requires the chosen contact method's details, checks phone/email formats, accepts only HTTPS social/website links without embedded credentials, and restricts Instagram/TikTok links to their expected hostnames. Duplicate profile URLs return a specific conflict response. Exact appointment addresses should not be placed in public location details unless the professional intends to disclose them.

## Migration and activation

Apply migration 0013_professional_details.sql with the operator migration connection using `pnpm db:migrate`. Existing profile values are preserved; new fields default to empty and contact preference defaults to booking. Profile photo storage is additive. Do not deploy the updated profile queries before this migration.

Clerk, managed PostgreSQL and private Blob credentials are still required for live creation/editing/uploads. Follow SETUP.md. No production providers were provisioned by this task.

## Verification

`tests/profile-workflow.test.ts` runs the actual profile, photo, service, opening-hour and media route handlers with PostgreSQL policies in PGlite. Only external identity/database transport and Blob storage are replaced with test adapters; account authorization, request validation, SQL, image conversion and public projection logic run normally. It tests draft creation, photo upload, owner-only reads, publication, edits, selected contact disclosure, service/hour publication, foreign IDs, invalid URLs, duplicate slugs, malformed images, photo replacement/deletion, hiding and suspension.

Other tests cover image limits/metadata and review moderation/eligibility. These checks do not establish that a live Clerk application or Blob store is configured correctly. Final staging checks must use two real professionals and a customer, including uploading, editing, hiding and viewing from an anonymous browser.

For repeatable visual checks without adding fictional professionals to the application:

```sh
node scripts/profile-visual-preview.mjs
```

Open http://127.0.0.1:3002/ for the public-page fixture and /editor for form layout. This is a separately served, read-only fixture with a visible fictional-data banner, synthetic artwork and disabled booking. Next.js navigation/image components use test adapters; it is not a functional account or live end-to-end test. It is never imported by application routes. The script generates reports/profile-preview.html and a compiled fixture under ignored reports/.

Mobile checks at 390px verify layout, image loading, section navigation and Book-to-availability scrolling. Desktop checks use 1280px. Restore temporary viewport settings after inspection.


## Partial-day time off

The availability editor now offers Whole days or Specific hours. Whole-day ranges include the final date; timed ranges end at the exact chosen time and can run overnight. Both use Europe/London rather than the browser timezone. Missing or repeated clock-change times are rejected with guidance to choose another time. Existing confirmed appointments and active checkout holds prevent overlapping blocks. A block may end exactly when an appointment starts. Labels remain owner-only through the existing row-level security.

The API accepts optional `startTime` and `endTime` values together in HH:mm format alongside the existing dates and label. Old whole-day requests remain compatible; no database migration is needed. Unit and database tests cover conversion, invalid times, booking boundaries and cross-account access. Live authenticated browser testing still requires the documented Clerk/database setup.

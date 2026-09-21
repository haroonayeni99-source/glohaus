# Discovery interactions

The responsive web feed now has Like, Save and Share controls. Browsing does not require a booking or registration. These controls work for photo/written posts; video hosting/playback and a native mobile app are not implemented.

## Guest and account behaviour

Guests keep preferences in this browser's local storage, capped on read at 1,000 entries. Storage is validated and failures do not report a successful save. Clearing browser data removes these preferences. Guest community saves can be fetched again from the public catalogue, in batches of 40, so they are not restricted to the latest feed entries. Unpublished/moderated posts are not returned.

Signed-in active members save community-post likes and bookmarks to PostgreSQL. The route derives the viewer from the verified session; caller-supplied viewer fields are rejected. Row-level security prevents reading or changing another member's preferences. Saving twice is idempotent, and removing a bookmark does not remove its like. Saved collections show 40 items per page, exclude moderated/unpublished content and retain private ownership boundaries. Guest preferences are not automatically copied into an account. Editorial inspiration preferences remain local to the browser even when signed in.

Like counts and identities of people who liked/saved a post are not publicly exposed. Following, comments, direct messages and personalised ranking have not been added.

Share opens a panel with the post link, Copy link and supported native-device sharing. Copy failure leaves a selectable link available; cancelling a native share does not report an error. Community posts use `/posts/:id`, which checks public visibility. Editorial links target a post anchor on the home feed. Localhost links work only on the local machine until deployment.

## Admin names

The admin can rename the singular/plural practitioner title and the five existing category labels. The discovery navigation/filter labels, public headers/cards/profile categories and professional category selector use those display labels. Category searches recognise the custom labels. Internal roles, stored category identifiers, existing assignments and permissions are unchanged. Administrative/system terminology may still refer to the internal professional role.

The mutation requires an active admin, fresh MFA, a substantive reason and bounded labels. Database operations independently check the verified-admin context and record the old and new label in the audit log. Ordinary users cannot write the label table. These controls require a real admin account and configured PostgreSQL before browser verification.

## Verification

199 automated tests pass, including private preference ownership, repeat saves, unlike/unsave independence, hidden content, forged payloads and authenticated route handling. Admin tests reject customer writes, forged verification and unverified admins; valid changes retain the category key and create an audit record. Browser checks verified guest like/save persistence across reload, Saved filtering, Copy link and the 390px mobile layout without horizontal overflow. Live account synchronisation and real admin-form browser verification remain blocked by provider setup.


## Browsing beyond the first page

The home feed loads 40 community posts initially and offers More inspiration when another page exists. Continuation uses the creation timestamp at PostgreSQL microsecond precision and UUID ordering, so equal timestamps do not skip or duplicate posts. Each page uses the public projection again; moderation and profile publication still apply. Newly loaded preference data is viewer-scoped and existing in-page edits take precedence when merging. The view moves to the first newly loaded post matching the selected category; failed loads can be retried. No new database migration is required.

Tests cover 85 posts across equal and microsecond timestamps, moderation between pages, malformed cursors and the public API response. Live multi-page browsing with real published professionals still requires the documented provider setup.

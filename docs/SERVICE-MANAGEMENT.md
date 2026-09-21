# Professional service management

Professionals manage their menu at `/professional/profile`. They can create and edit names, descriptions, GBP prices, durations, optional portfolio images and active status. A Deactivate action removes a service from the public menu and new booking selection. Edit an inactive service to reactivate it. Deactivation preserves historical bookings and their frozen service details; it does not cancel existing appointments.

## Images

Upload JPEG, PNG or WebP images in `/professional/portfolio`, then select an image in the service editor. Existing upload validation, bounded WebP conversion, metadata removal and private Blob storage apply. Only a published portfolio image is shown publicly. Draft and hidden images remain absent from the public service projection. A composite database foreign key prevents attaching another professional's image, alongside owner-scoped application queries and RLS. Removing the selection does not delete the underlying portfolio image.

## Validation and API

Service name: 2–100 characters; description: at most 500; duration: 15–480 minutes in increments of five; price: £1–£10,000, stored as integer pence. Active status must be a boolean. The optional image identifier must be a UUID belonging to the authenticated professional. Extra fields, including submitted owner identifiers, are rejected. Existing deposit validation remains unchanged.

- `POST /api/v1/professional/services`: create.
- `PUT /api/v1/professional/services/:id`: edit/reactivate; optional `assetId` is a portfolio UUID or null.
- `DELETE /api/v1/professional/services/:id`: deactivate, without physical deletion. Repeated owner deactivation is safe.

Mutation routes require an authenticated active professional, matching Origin and JSON Content-Type. Professional identity is derived from the session. Public SQL projections filter inactive services. The booking database function independently rejects inactive services even if a caller knows their IDs.

Apply migration `0017_service_images.sql` before using the updated app. Existing services default to no image. No new provider or environment variables are required; production image uploads still require the documented private Blob configuration.

## Verification

Tests cover create/edit/reactivate/deactivate through authenticated routes, other-owner rejection, service validation, owned-image association, public image hiding, retained service records and rejection of inactive bookings. Real authenticated browser/upload verification still requires Clerk, PostgreSQL and Blob provisioning; local workflow tests substitute identity and storage providers.

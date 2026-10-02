ALTER TABLE beauty.professional_profiles
  ADD COLUMN IF NOT EXISTS travels_to_you boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW beauty.public_profile_details AS
SELECT
  p.id,
  p.business_description,
  p.location_details,
  p.contact_preference,
  CASE WHEN p.contact_preference='email' THEN p.contact_email ELSE '' END AS contact_email,
  CASE WHEN p.contact_preference='phone' THEN p.contact_phone ELSE '' END AS contact_phone,
  p.instagram_url,
  p.tiktok_url,
  p.website_url,
  photo.id AS photo_id,
  photo.alt_text AS photo_alt,
  p.travels_to_you
FROM beauty.professional_profiles p
LEFT JOIN beauty.profile_photos photo ON photo.professional_id=p.id;

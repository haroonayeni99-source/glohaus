ALTER TABLE beauty.professional_profiles
 ADD COLUMN business_description text NOT NULL DEFAULT '' CHECK(length(business_description)<=3000),
 ADD COLUMN location_details text NOT NULL DEFAULT '' CHECK(length(location_details)<=180),
 ADD COLUMN contact_preference text NOT NULL DEFAULT 'booking' CHECK(contact_preference IN('booking','email','phone','instagram')),
 ADD COLUMN contact_email text NOT NULL DEFAULT '' CHECK(length(contact_email)<=254),
 ADD COLUMN contact_phone text NOT NULL DEFAULT '' CHECK(length(contact_phone)<=25),
 ADD COLUMN instagram_url text NOT NULL DEFAULT '' CHECK(length(instagram_url)<=500),
 ADD COLUMN tiktok_url text NOT NULL DEFAULT '' CHECK(length(tiktok_url)<=500),
 ADD COLUMN website_url text NOT NULL DEFAULT '' CHECK(length(website_url)<=500),
 ADD CONSTRAINT required_contact CHECK((contact_preference<>'email' OR length(contact_email)>3) AND (contact_preference<>'phone' OR length(contact_phone)>=7) AND (contact_preference<>'instagram' OR length(instagram_url)>0));
GRANT UPDATE(business_description,location_details,contact_preference,contact_email,contact_phone,instagram_url,tiktok_url,website_url) ON beauty.professional_profiles TO beauty_app;
GRANT SELECT(business_description,location_details,contact_preference,contact_email,contact_phone,instagram_url,tiktok_url,website_url) ON beauty.professional_profiles TO beauty_catalog;

CREATE TABLE beauty.profile_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 professional_id uuid UNIQUE NOT NULL REFERENCES beauty.professional_profiles(id),
 blob_path text UNIQUE NOT NULL,
 alt_text text NOT NULL CHECK(length(alt_text) BETWEEN 3 AND 200)
);
ALTER TABLE beauty.profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.profile_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY profile_photo_owner ON beauty.profile_photos FOR ALL TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id)) WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.profile_photos TO beauty_app;
GRANT SELECT ON beauty.profile_photos TO beauty_catalog;
CREATE POLICY profile_photo_public ON beauty.profile_photos FOR SELECT TO beauty_catalog USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE VIEW beauty.public_profile_details WITH(security_barrier=true) AS
 SELECT p.id,p.business_description,p.location_details,p.contact_preference,
 CASE WHEN p.contact_preference='email' THEN p.contact_email ELSE '' END AS contact_email,
 CASE WHEN p.contact_preference='phone' THEN p.contact_phone ELSE '' END AS contact_phone,
 p.instagram_url,p.tiktok_url,p.website_url,photo.id AS photo_id,photo.alt_text AS photo_alt
 FROM beauty.professional_profiles p LEFT JOIN beauty.profile_photos photo ON photo.professional_id=p.id;
CREATE VIEW beauty.published_profile_photo_paths WITH(security_barrier=true) AS SELECT id,blob_path FROM beauty.profile_photos;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_profile_details OWNER TO beauty_catalog;
ALTER VIEW beauty.published_profile_photo_paths OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_profile_details,beauty.published_profile_photo_paths TO beauty_app;

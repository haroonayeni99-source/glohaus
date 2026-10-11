-- Only explicitly confirmed PUBLIC business pins are stored here.
-- No backfill, private addresses, customer locations, or booking-location reuse.
CREATE TABLE beauty.professional_public_locations (
  professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
  latitude double precision,
  longitude double precision,
  source text CHECK (source IN ('pin','device')),
  confirmed_at timestamptz,
  CONSTRAINT public_location_complete CHECK (
    (latitude IS NULL AND longitude IS NULL AND source IS NULL AND confirmed_at IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL AND source IS NOT NULL AND confirmed_at IS NOT NULL
        AND latitude BETWEEN -85 AND 85 AND longitude BETWEEN -180 AND 180)
  )
);
ALTER TABLE beauty.professional_public_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_public_locations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.professional_public_locations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON beauty.professional_public_locations TO beauty_app;
CREATE POLICY public_location_owner_read ON beauty.professional_public_locations
  FOR SELECT TO beauty_app USING (EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE POLICY public_location_owner_insert ON beauty.professional_public_locations
  FOR INSERT TO beauty_app WITH CHECK (EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE POLICY public_location_owner_update ON beauty.professional_public_locations
  FOR UPDATE TO beauty_app
  USING (EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id))
  WITH CHECK (EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
GRANT SELECT ON beauty.professional_public_locations TO beauty_catalog;
CREATE POLICY catalog_confirmed_public_location ON beauty.professional_public_locations
  FOR SELECT TO beauty_catalog
  USING (confirmed_at IS NOT NULL AND EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
-- Match the existing restricted catalogue boundary: published, active accounts only.
CREATE VIEW beauty.public_professional_locations WITH (security_barrier=true) AS
  SELECT professional_id,latitude,longitude,confirmed_at
  FROM beauty.professional_public_locations WHERE confirmed_at IS NOT NULL;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_professional_locations OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
REVOKE ALL ON beauty.public_professional_locations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON beauty.public_professional_locations TO beauty_app;

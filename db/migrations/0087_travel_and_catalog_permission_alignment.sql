-- Keep the new travel preference aligned with the existing profile column permissions.
GRANT UPDATE (travels_to_you) ON beauty.professional_profiles TO beauty_app;
GRANT SELECT (travels_to_you) ON beauty.professional_profiles TO beauty_catalog;

-- The public professional projection includes trust state and is owned by the
-- restricted catalogue role, so ensure the fresh-database path has the same
-- read boundary as production.
GRANT SELECT ON beauty.professional_trust_status TO beauty_catalog;
DROP POLICY IF EXISTS catalog_professional_trust ON beauty.professional_trust_status;
CREATE POLICY catalog_professional_trust
ON beauty.professional_trust_status
FOR SELECT TO beauty_catalog
USING (true);

-- Restore the restricted catalogue-owner execution model for public services.
-- security_invoker caused anonymous marketplace reads to be filtered by the
-- private owner-only beauty_app policy.

DROP VIEW IF EXISTS beauty.public_services;

CREATE VIEW beauty.public_services
WITH (security_barrier=true)
AS
SELECT
  s.id,
  s.professional_id,
  s.name,
  s.description,
  s.duration_minutes,
  s.price_pence,
  s.deposit_pence,
  a.id AS asset_id,
  a.alt_text AS image_alt,
  s.category
FROM beauty.services s
LEFT JOIN beauty.public_portfolio a
  ON a.id=s.asset_id
 AND a.professional_id=s.professional_id
WHERE s.active;

GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_services OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;

GRANT SELECT ON beauty.public_services TO beauty_app;

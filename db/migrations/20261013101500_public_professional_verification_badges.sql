-- Publish only existing approved verification flags; preserve the catalog role and RLS boundary.
-- The existing verified status continues to represent completed identity/payment checks.
CREATE OR REPLACE VIEW beauty.public_professionals
WITH (security_barrier=true)
AS
SELECT
  p.id,
  p.slug,
  p.business_name,
  p.bio,
  p.city,
  p.category,
  CASE
    WHEN (
      coalesce(t.standing_status,'good')='restricted'
      OR coalesce(t.verification_status,'unverified')='rejected'
    ) THEN 'restricted'
    ELSE coalesce(t.verification_status,'unverified')
  END AS verification_status,
  (coalesce(t.verification_status,'unverified')='verified'
    AND coalesce(t.standing_status,'good')='good') AS identity_verified,
  (coalesce(t.verification_status,'unverified')='verified'
    AND coalesce(t.standing_status,'good')='good'
    AND coalesce(t.business_verified,false)) AS business_verified,
  (coalesce(t.verification_status,'unverified')='verified'
    AND coalesce(t.standing_status,'good')='good'
    AND coalesce(t.professional_verified,false)) AS professional_verified
FROM beauty.professional_profiles p
LEFT JOIN beauty.professional_trust_status t
  ON t.professional_id=p.id
WHERE p.publication_status='published';

GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_professionals OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;

GRANT SELECT ON beauty.public_professionals TO beauty_app;

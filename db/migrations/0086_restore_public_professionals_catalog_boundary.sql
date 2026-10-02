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
  END AS verification_status
FROM beauty.professional_profiles p
LEFT JOIN beauty.professional_trust_status t
  ON t.professional_id=p.id
WHERE p.publication_status='published';

GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_professionals OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;

GRANT SELECT ON beauty.public_professionals TO beauty_app;

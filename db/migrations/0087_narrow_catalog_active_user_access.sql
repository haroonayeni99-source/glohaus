-- Keep public professional discovery able to test account activity without
-- granting the catalog role direct access to private user fields such as email.

CREATE OR REPLACE FUNCTION beauty.catalog_user_is_active(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM beauty.users u
    WHERE u.id=target_user_id
      AND u.status='active'
  );
$$;

ALTER FUNCTION beauty.catalog_user_is_active(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.catalog_user_is_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.catalog_user_is_active(uuid) TO beauty_catalog;

DROP POLICY IF EXISTS catalog_published_professional
ON beauty.professional_profiles;

CREATE POLICY catalog_published_professional
ON beauty.professional_profiles
FOR SELECT TO beauty_catalog
USING (
  publication_status='published'
  AND beauty.catalog_user_is_active(user_id)
);

REVOKE SELECT ON beauty.users FROM beauty_catalog;

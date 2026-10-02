-- Keep public catalogue/follow behaviour functional without granting
-- beauty_catalog direct reads of private user or booking tables.

CREATE OR REPLACE FUNCTION beauty.can_manage_follow(
  target_customer uuid,
  target_professional uuid,
  actor_auth_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM beauty.users u
      JOIN beauty.customer_profiles c ON c.user_id=u.id
      WHERE u.id=target_customer
        AND u.auth_id=actor_auth_id
        AND u.status='active'
    )
    AND EXISTS (
      SELECT 1
      FROM beauty.professional_profiles p
      JOIN beauty.users u ON u.id=p.user_id
      WHERE p.id=target_professional
        AND p.publication_status='published'
        AND u.status='active'
        AND p.user_id<>target_customer
    );
$$;

CREATE OR REPLACE FUNCTION beauty.owns_follow(target_customer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM beauty.users u
    JOIN beauty.customer_profiles c ON c.user_id=u.id
    WHERE u.id=target_customer
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  );
$$;

CREATE OR REPLACE FUNCTION beauty.professional_follower_count(target uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM beauty.professional_profiles p
      JOIN beauty.users u ON u.id=p.user_id
      WHERE p.id=target
        AND p.publication_status='published'
        AND u.status='active'
    )
    THEN (
      SELECT count(*)::integer
      FROM beauty.professional_follows f
      WHERE f.professional_id=target
    )
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION beauty.set_professional_follow(
  target_customer uuid,
  target_professional uuid,
  should_follow boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF should_follow THEN
    IF NOT beauty.can_manage_follow(
      target_customer,
      target_professional,
      beauty.auth_id()
    ) THEN
      RAISE EXCEPTION 'follow not permitted' USING ERRCODE='42501';
    END IF;

    INSERT INTO beauty.professional_follows(customer_id,professional_id)
    VALUES(target_customer,target_professional)
    ON CONFLICT DO NOTHING;
  ELSE
    IF NOT beauty.owns_follow(target_customer) THEN
      RAISE EXCEPTION 'follow not permitted' USING ERRCODE='42501';
    END IF;

    DELETE FROM beauty.professional_follows
    WHERE customer_id=target_customer
      AND professional_id=target_professional;
  END IF;
END;
$$;

ALTER FUNCTION beauty.can_manage_follow(uuid,uuid,text) OWNER TO postgres;
ALTER FUNCTION beauty.owns_follow(uuid) OWNER TO postgres;
ALTER FUNCTION beauty.professional_follower_count(uuid) OWNER TO postgres;
ALTER FUNCTION beauty.set_professional_follow(uuid,uuid,boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION beauty.can_manage_follow(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.owns_follow(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.professional_follower_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.set_professional_follow(uuid,uuid,boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION beauty.can_manage_follow(uuid,uuid,text)
  TO beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.owns_follow(uuid)
  TO beauty_app,beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.professional_follower_count(uuid)
  TO beauty_app,beauty_catalog,beauty_admin_ops;
GRANT EXECUTE ON FUNCTION beauty.set_professional_follow(uuid,uuid,boolean)
  TO beauty_app,beauty_catalog;

DROP POLICY IF EXISTS catalog_published_products ON beauty.products;
CREATE POLICY catalog_published_products
ON beauty.products
FOR SELECT TO beauty_catalog
USING (
  publication_status='published'
  AND EXISTS (
    SELECT 1
    FROM beauty.professional_profiles p
    WHERE p.id=products.professional_id
      AND p.publication_status='published'
      AND beauty.catalog_user_is_active(p.user_id)
  )
);

GRANT EXECUTE ON FUNCTION beauty.catalog_completed_booking_professional(uuid)
  TO beauty_app;

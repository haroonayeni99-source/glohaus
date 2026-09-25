-- GLOHAUS professional following foundation.
-- Follower rows are private. beauty_app can only read/delete its own rows and
-- can create a row only when the current actor is an active customer and the
-- target is an active, published professional.
CREATE TABLE beauty.professional_follows (
  customer_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, professional_id)
);
CREATE INDEX professional_follows_professional_created
  ON beauty.professional_follows(professional_id, created_at DESC);

ALTER TABLE beauty.professional_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_follows FORCE ROW LEVEL SECURITY;

-- These predicates run as the restricted catalog owner so RLS on account
-- tables cannot accidentally make a valid follow fail, while callers receive
-- only booleans rather than account/role rows.
CREATE FUNCTION beauty.can_manage_follow(target_customer uuid, target_professional uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM beauty.users u
    JOIN beauty.user_roles r ON r.user_id = u.id
    WHERE u.id = target_customer
      AND u.auth_id = beauty.auth_id()
      AND u.status = 'active'
      AND r.role = 'customer'
  )
  AND EXISTS (
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id = p.user_id
    WHERE p.id = target_professional
      AND p.publication_status = 'published'
      AND u.status = 'active'
      AND p.user_id <> target_customer
  )
$$;

CREATE FUNCTION beauty.owns_follow(target_customer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM beauty.users u
    WHERE u.id = target_customer
      AND u.auth_id = beauty.auth_id()
      AND u.status = 'active'
  )
$$;

CREATE FUNCTION beauty.professional_follower_count(target uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT count(*)::integer
  FROM beauty.professional_follows f
  JOIN beauty.professional_profiles p ON p.id = f.professional_id
  JOIN beauty.users u ON u.id = p.user_id
  WHERE f.professional_id = target
    AND p.publication_status = 'published'
    AND u.status = 'active'
$$;

GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER FUNCTION beauty.can_manage_follow(uuid,uuid) OWNER TO beauty_catalog;
ALTER FUNCTION beauty.owns_follow(uuid) OWNER TO beauty_catalog;
ALTER FUNCTION beauty.professional_follower_count(uuid) OWNER TO beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_catalog;
GRANT SELECT ON beauty.users, beauty.user_roles, beauty.professional_profiles, beauty.professional_follows TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;

REVOKE ALL ON FUNCTION beauty.can_manage_follow(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.owns_follow(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.professional_follower_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.can_manage_follow(uuid,uuid) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.owns_follow(uuid) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.professional_follower_count(uuid) TO beauty_app;

GRANT SELECT ON beauty.professional_follows TO beauty_app;
GRANT INSERT (customer_id, professional_id) ON beauty.professional_follows TO beauty_app;
GRANT DELETE ON beauty.professional_follows TO beauty_app;

CREATE POLICY follow_self_read ON beauty.professional_follows
  FOR SELECT TO beauty_app
  USING (beauty.owns_follow(customer_id));

CREATE POLICY follow_self_create ON beauty.professional_follows
  FOR INSERT TO beauty_app
  WITH CHECK (beauty.can_manage_follow(customer_id, professional_id));

CREATE POLICY follow_self_delete ON beauty.professional_follows
  FOR DELETE TO beauty_app
  USING (beauty.owns_follow(customer_id));

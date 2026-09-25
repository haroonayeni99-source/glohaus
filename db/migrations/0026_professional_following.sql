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

-- A narrow definer function performs the write after validating the caller and target.
-- This avoids relying on INSERT policy evaluation across other FORCE-RLS tables.

-- These predicates run as the restricted catalog owner so RLS on account
-- tables cannot accidentally make a valid follow fail, while callers receive
-- only booleans rather than account/role rows.
CREATE FUNCTION beauty.can_manage_follow(target_customer uuid, target_professional uuid, actor_auth_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $follow$
  SELECT EXISTS (
    SELECT 1
    FROM beauty.users u
    WHERE u.id = target_customer
      AND u.auth_id = actor_auth_id
      AND u.status = 'active'
  )
  AND EXISTS (
    SELECT 1
    FROM beauty.customer_profiles c
    WHERE c.user_id = target_customer
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
$follow$;

CREATE FUNCTION beauty.set_professional_follow(target_customer uuid, target_professional uuid, actor_auth_id text, should_follow boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $follow_write$
BEGIN
  IF should_follow THEN
    IF NOT beauty.can_manage_follow(target_customer, target_professional, actor_auth_id) THEN
      RAISE EXCEPTION 'follow not permitted' USING ERRCODE = '42501';
    END IF;
    INSERT INTO beauty.professional_follows(customer_id, professional_id)
      VALUES (target_customer, target_professional)
      ON CONFLICT DO NOTHING;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM beauty.users u
      WHERE u.id = target_customer
        AND u.auth_id = actor_auth_id
        AND u.status = 'active'
    ) THEN
      RAISE EXCEPTION 'follow not permitted' USING ERRCODE = '42501';
    END IF;
    DELETE FROM beauty.professional_follows
      WHERE customer_id = target_customer AND professional_id = target_professional;
  END IF;
END
$follow_write$;

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
ALTER FUNCTION beauty.can_manage_follow(uuid,uuid,text) OWNER TO beauty_catalog;
ALTER FUNCTION beauty.set_professional_follow(uuid,uuid,text,boolean) OWNER TO beauty_catalog;
ALTER FUNCTION beauty.owns_follow(uuid) OWNER TO beauty_catalog;
ALTER FUNCTION beauty.professional_follower_count(uuid) OWNER TO beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_catalog;
-- Keep the catalogue role blind to private account fields such as email.
GRANT SELECT (id, auth_id, status) ON beauty.users TO beauty_catalog;
ALTER TABLE beauty.users NO FORCE ROW LEVEL SECURITY;
GRANT SELECT (user_id) ON beauty.customer_profiles TO beauty_catalog;
ALTER TABLE beauty.customer_profiles NO FORCE ROW LEVEL SECURITY;
GRANT SELECT (id, user_id, publication_status) ON beauty.professional_profiles TO beauty_catalog;
ALTER TABLE beauty.professional_profiles NO FORCE ROW LEVEL SECURITY;
GRANT SELECT (customer_id, professional_id) ON beauty.professional_follows TO beauty_catalog;
ALTER TABLE beauty.professional_follows NO FORCE ROW LEVEL SECURITY;
GRANT INSERT (customer_id, professional_id), DELETE ON beauty.professional_follows TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;

REVOKE ALL ON FUNCTION beauty.can_manage_follow(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.set_professional_follow(uuid,uuid,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.owns_follow(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.professional_follower_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.can_manage_follow(uuid,uuid,text) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.set_professional_follow(uuid,uuid,text,boolean) TO beauty_app;
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
  WITH CHECK (beauty.can_manage_follow(customer_id, professional_id, beauty.auth_id()));

CREATE POLICY follow_self_delete ON beauty.professional_follows
  FOR DELETE TO beauty_app
  USING (beauty.owns_follow(customer_id));

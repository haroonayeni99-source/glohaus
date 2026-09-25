-- GLOHAUS professional following foundation.
-- Customers can follow published professionals. Follower identities remain private:
-- beauty_app can only see the current customer's own follow rows.
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

GRANT SELECT ON beauty.professional_follows TO beauty_app;
GRANT INSERT (customer_id, professional_id) ON beauty.professional_follows TO beauty_app;
GRANT DELETE ON beauty.professional_follows TO beauty_app;

CREATE POLICY follow_self_read ON beauty.professional_follows
  FOR SELECT TO beauty_app
  USING (
    customer_id IN (
      SELECT u.id
      FROM beauty.users u
      WHERE u.auth_id = beauty.auth_id() AND u.status = 'active'
    )
  );

CREATE POLICY follow_self_create ON beauty.professional_follows
  FOR INSERT TO beauty_app
  WITH CHECK (
    customer_id IN (
      SELECT r.user_id
      FROM beauty.user_roles r
      WHERE r.role = 'customer'
    )
    AND customer_id IN (
      SELECT u.id
      FROM beauty.users u
      WHERE u.auth_id = beauty.auth_id() AND u.status = 'active'
    )
    AND professional_id IN (
      SELECT p.id
      FROM beauty.professional_profiles p
      WHERE p.publication_status = 'published'
        AND p.user_id <> customer_id
        AND p.user_id IN (
          SELECT u.id FROM beauty.users u WHERE u.status = 'active'
        )
    )
  );

CREATE POLICY follow_self_delete ON beauty.professional_follows
  FOR DELETE TO beauty_app
  USING (
    customer_id IN (
      SELECT u.id
      FROM beauty.users u
      WHERE u.auth_id = beauty.auth_id() AND u.status = 'active'
    )
  );

-- Aggregate counts are exposed through a SECURITY DEFINER function so callers
-- never receive another customer's follow row or identity.
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
ALTER FUNCTION beauty.professional_follower_count(uuid) OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
REVOKE ALL ON FUNCTION beauty.professional_follower_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.professional_follower_count(uuid) TO beauty_app;

-- GLOHAUS professional following foundation.
-- Customers can follow published professionals. The authenticated beauty_app
-- role can only create/delete its own follow relationship.
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

CREATE POLICY follow_self_read ON beauty.professional_follows
  FOR SELECT TO beauty_app
  USING (
    EXISTS (
      SELECT 1 FROM beauty.users u
      WHERE u.id = customer_id
        AND u.auth_id = beauty.auth_id()
        AND u.status = 'active'
    )
  );

CREATE POLICY follow_self_create ON beauty.professional_follows
  FOR INSERT TO beauty_app
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM beauty.users u
      JOIN beauty.user_roles r ON r.user_id = u.id
      WHERE u.id = customer_id
        AND u.auth_id = beauty.auth_id()
        AND u.status = 'active'
        AND r.role = 'customer'
    )
    AND EXISTS (
      SELECT 1 FROM beauty.professional_profiles p
      JOIN beauty.users pu ON pu.id = p.user_id
      WHERE p.id = professional_id
        AND p.publication_status = 'published'
        AND pu.status = 'active'
        AND p.user_id <> customer_id
    )
  );

CREATE POLICY follow_self_delete ON beauty.professional_follows
  FOR DELETE TO beauty_app
  USING (
    EXISTS (
      SELECT 1 FROM beauty.users u
      WHERE u.id = customer_id
        AND u.auth_id = beauty.auth_id()
        AND u.status = 'active'
    )
  );

GRANT SELECT ON beauty.professional_follows TO beauty_app;
GRANT INSERT (customer_id, professional_id) ON beauty.professional_follows TO beauty_app;
GRANT DELETE ON beauty.professional_follows TO beauty_app;

-- Public profiles expose only an aggregate follower count, never follower identity.
CREATE VIEW beauty.public_professional_follow_counts
WITH (security_barrier = true) AS
  SELECT p.id AS professional_id, count(f.customer_id)::integer AS follower_count
  FROM beauty.professional_profiles p
  LEFT JOIN beauty.professional_follows f ON f.professional_id = p.id
  WHERE p.publication_status = 'published'
  GROUP BY p.id;

GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_professional_follow_counts OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_professional_follow_counts TO beauty_app;

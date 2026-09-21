-- Accounts only. Booking/payment schema belongs to subsequent milestones.
-- Run as the migration owner in a dedicated application database.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beauty_app') THEN
    CREATE ROLE beauty_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA beauty;
GRANT USAGE ON SCHEMA beauty TO beauty_app;

CREATE TABLE beauty.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id text UNIQUE NOT NULL CHECK (length(auth_id) BETWEEN 1 AND 255),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.user_roles (
  user_id uuid NOT NULL REFERENCES beauty.users(id),
  role text NOT NULL CHECK (role IN ('customer', 'professional', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
CREATE TABLE beauty.customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES beauty.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.professional_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES beauty.users(id),
  publication_status text NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_reference text NOT NULL,
  action text NOT NULL,
  target_user_id uuid NOT NULL REFERENCES beauty.users(id),
  reason text NOT NULL CHECK (length(reason) >= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION beauty.auth_id() RETURNS text LANGUAGE sql STABLE
  SET search_path = pg_catalog
  AS $$ SELECT nullif(current_setting('app.auth_id', true), '') $$;
REVOKE ALL ON FUNCTION beauty.auth_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_app;

ALTER TABLE beauty.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.users FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.customer_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.admin_audit_logs FORCE ROW LEVEL SECURITY;

-- A suspended user can read their own status, but no roles or profile data.
CREATE POLICY user_self_read ON beauty.users FOR SELECT TO beauty_app
  USING (auth_id = beauty.auth_id());
CREATE POLICY user_self_create ON beauty.users FOR INSERT TO beauty_app
  WITH CHECK (auth_id = beauty.auth_id() AND status = 'active');
CREATE POLICY user_self_name_update ON beauty.users FOR UPDATE TO beauty_app
  USING (auth_id = beauty.auth_id() AND status = 'active')
  WITH CHECK (auth_id = beauty.auth_id() AND status = 'active');
CREATE POLICY role_self_read ON beauty.user_roles FOR SELECT TO beauty_app
  USING (EXISTS (SELECT 1 FROM beauty.users u WHERE u.id = user_id AND u.auth_id = beauty.auth_id() AND u.status = 'active'));
CREATE POLICY role_safe_enrolment ON beauty.user_roles FOR INSERT TO beauty_app
  WITH CHECK (role IN ('customer', 'professional') AND EXISTS (
    SELECT 1 FROM beauty.users u WHERE u.id = user_id AND u.auth_id = beauty.auth_id() AND u.status = 'active'
  ));
CREATE POLICY customer_self_read ON beauty.customer_profiles FOR SELECT TO beauty_app
  USING (EXISTS (SELECT 1 FROM beauty.users u WHERE u.id = user_id AND u.auth_id = beauty.auth_id() AND u.status = 'active'));
CREATE POLICY customer_self_create ON beauty.customer_profiles FOR INSERT TO beauty_app
  WITH CHECK (EXISTS (SELECT 1 FROM beauty.users u JOIN beauty.user_roles r ON r.user_id = u.id
    WHERE u.id = customer_profiles.user_id AND u.auth_id = beauty.auth_id() AND u.status = 'active' AND r.role = 'customer'));
CREATE POLICY professional_self_read ON beauty.professional_profiles FOR SELECT TO beauty_app
  USING (EXISTS (SELECT 1 FROM beauty.users u WHERE u.id = user_id AND u.auth_id = beauty.auth_id() AND u.status = 'active'));
CREATE POLICY professional_self_create ON beauty.professional_profiles FOR INSERT TO beauty_app
  WITH CHECK (publication_status = 'draft' AND EXISTS (
    SELECT 1 FROM beauty.users u JOIN beauty.user_roles r ON r.user_id = u.id
    WHERE u.id = professional_profiles.user_id AND u.auth_id = beauty.auth_id() AND u.status = 'active' AND r.role = 'professional'
  ));

GRANT SELECT ON beauty.users, beauty.user_roles, beauty.customer_profiles, beauty.professional_profiles TO beauty_app;
GRANT INSERT (auth_id, email, display_name) ON beauty.users TO beauty_app;
-- A harmless column grant also permits SELECT FOR UPDATE during enrollment.
GRANT UPDATE (display_name) ON beauty.users TO beauty_app;
GRANT INSERT (user_id, role) ON beauty.user_roles TO beauty_app;
GRANT INSERT (user_id) ON beauty.customer_profiles, beauty.professional_profiles TO beauty_app;
-- No status/identity UPDATE, DELETE, TRUNCATE, audit-log access, or privileged-role grants.
-- Use a separate operator connection for explicit, audited admin provisioning.

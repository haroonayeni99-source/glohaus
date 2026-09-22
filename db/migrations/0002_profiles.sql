-- Public projections have a deliberately restricted, non-owner database role.
CREATE ROLE beauty_catalog NOLOGIN NOSUPERUSER NOBYPASSRLS;
-- PostgreSQL requires the migration owner to be able to SET ROLE before a
-- view can be transferred to this restricted, no-login owner.
GRANT beauty_catalog TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_catalog;
ALTER TABLE beauty.professional_profiles
  ADD COLUMN slug text UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  ADD COLUMN business_name text NOT NULL DEFAULT '' CHECK (length(business_name) <= 100),
  ADD COLUMN bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 600),
  ADD COLUMN city text NOT NULL DEFAULT '' CHECK (length(city) <= 80),
  ADD COLUMN category text NOT NULL DEFAULT 'Hair' CHECK (category IN ('Hair','Nails','Makeup','Lashes & brows','Skin')),
  ADD CONSTRAINT published_profile_complete CHECK (publication_status <> 'published' OR (slug IS NOT NULL AND length(business_name) >= 2 AND length(city) >= 2 AND length(bio) >= 20));
CREATE POLICY professional_self_update ON beauty.professional_profiles FOR UPDATE TO beauty_app
  USING (EXISTS (SELECT 1 FROM beauty.users u WHERE u.id = user_id AND u.auth_id = beauty.auth_id() AND u.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM beauty.users u WHERE u.id = user_id AND u.auth_id = beauty.auth_id() AND u.status = 'active'));
GRANT UPDATE (slug,business_name,bio,city,category,publication_status) ON beauty.professional_profiles TO beauty_app;

CREATE TABLE beauty.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480 AND duration_minutes % 5 = 0),
  price_pence integer NOT NULL CHECK (price_pence BETWEEN 100 AND 1000000),
  deposit_pence integer NOT NULL CHECK (deposit_pence >= 0 AND deposit_pence <= price_pence),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,professional_id)
);
CREATE INDEX services_professional ON beauty.services(professional_id);
ALTER TABLE beauty.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.services FORCE ROW LEVEL SECURITY;
CREATE POLICY services_owner ON beauty.services FOR ALL TO beauty_app
  USING (EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id = professional_id))
  WITH CHECK (EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id = professional_id));
GRANT SELECT ON beauty.services TO beauty_app;
GRANT INSERT (professional_id,name,description,duration_minutes,price_pence,deposit_pence,active) ON beauty.services TO beauty_app;
GRANT UPDATE (name,description,duration_minutes,price_pence,deposit_pence,active) ON beauty.services TO beauty_app;

-- Catalogue role cannot read contact details, auth IDs or account names.
GRANT SELECT (id,status) ON beauty.users TO beauty_catalog;
CREATE POLICY catalog_active_user ON beauty.users FOR SELECT TO beauty_catalog USING (status = 'active');
GRANT SELECT (id,user_id,slug,business_name,bio,city,category,publication_status) ON beauty.professional_profiles TO beauty_catalog;
CREATE POLICY catalog_published_professional ON beauty.professional_profiles FOR SELECT TO beauty_catalog
  USING (publication_status = 'published' AND EXISTS(SELECT 1 FROM beauty.users u WHERE u.id = user_id AND u.status = 'active'));
GRANT SELECT ON beauty.services TO beauty_catalog;
CREATE POLICY catalog_active_service ON beauty.services FOR SELECT TO beauty_catalog
  USING (active AND EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id = professional_id));

CREATE VIEW beauty.public_professionals WITH (security_barrier = true) AS
  SELECT id,slug,business_name,bio,city,category FROM beauty.professional_profiles WHERE publication_status = 'published';
CREATE VIEW beauty.public_services WITH (security_barrier = true) AS
  SELECT id,professional_id,name,description,duration_minutes,price_pence,deposit_pence FROM beauty.services WHERE active;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_professionals OWNER TO beauty_catalog;
ALTER VIEW beauty.public_services OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_professionals,beauty.public_services TO beauty_app;

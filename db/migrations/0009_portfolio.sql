CREATE TABLE beauty.portfolio_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),blob_path text UNIQUE NOT NULL,
 alt_text text NOT NULL CHECK(length(alt_text) BETWEEN 3 AND 200),publication_status text NOT NULL DEFAULT 'draft' CHECK(publication_status IN('draft','published','hidden')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,professional_id)
);
ALTER TABLE beauty.portfolio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.portfolio_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY portfolio_owner ON beauty.portfolio_assets FOR ALL TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id)) WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
GRANT SELECT ON beauty.portfolio_assets TO beauty_app;
GRANT INSERT(id,professional_id,blob_path,alt_text) ON beauty.portfolio_assets TO beauty_app;
GRANT UPDATE(alt_text,publication_status) ON beauty.portfolio_assets TO beauty_app;
GRANT SELECT ON beauty.portfolio_assets TO beauty_catalog;
CREATE POLICY portfolio_public ON beauty.portfolio_assets FOR SELECT TO beauty_catalog USING(publication_status='published' AND EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE VIEW beauty.public_portfolio WITH(security_barrier=true) AS SELECT id,professional_id,alt_text,created_at FROM beauty.portfolio_assets;
-- Blob paths are intentionally absent from public data; this resolver is only called by the image proxy.
CREATE VIEW beauty.published_asset_paths WITH(security_barrier=true) AS SELECT id,blob_path FROM beauty.portfolio_assets;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_portfolio OWNER TO beauty_catalog;
ALTER VIEW beauty.published_asset_paths OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_portfolio,beauty.published_asset_paths TO beauty_app;

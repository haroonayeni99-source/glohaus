-- Candidate only. Excluded from production migrationPlan until backup/recovery,
-- isolated PostgreSQL and genuine hosted acceptance are verified.
CREATE TABLE beauty.portfolio_collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 name text NOT NULL CHECK(name=btrim(name) AND length(name) BETWEEN 1 AND 80),
 publication_status text NOT NULL DEFAULT 'draft' CHECK(publication_status IN('draft','published','hidden')),
 sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 10000),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,professional_id)
);
CREATE UNIQUE INDEX portfolio_collection_name_unique ON beauty.portfolio_collections(professional_id,lower(name));
CREATE TABLE beauty.portfolio_asset_presentation (
 asset_id uuid PRIMARY KEY, professional_id uuid NOT NULL,
 featured boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 10000),
 FOREIGN KEY(asset_id,professional_id) REFERENCES beauty.portfolio_assets(id,professional_id) ON DELETE CASCADE
);
CREATE TABLE beauty.portfolio_collection_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), professional_id uuid NOT NULL,
 collection_id uuid NOT NULL, asset_id uuid, social_post_id uuid REFERENCES beauty.social_portfolio(id) ON DELETE CASCADE,
 CHECK(num_nonnulls(asset_id,social_post_id)=1),
 FOREIGN KEY(collection_id,professional_id) REFERENCES beauty.portfolio_collections(id,professional_id) ON DELETE CASCADE,
 FOREIGN KEY(asset_id,professional_id) REFERENCES beauty.portfolio_assets(id,professional_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX portfolio_collection_upload_unique ON beauty.portfolio_collection_items(collection_id,asset_id) WHERE asset_id IS NOT NULL;
CREATE UNIQUE INDEX portfolio_collection_social_unique ON beauty.portfolio_collection_items(collection_id,social_post_id) WHERE social_post_id IS NOT NULL;
CREATE INDEX portfolio_collection_professional ON beauty.portfolio_collections(professional_id,sort_order,id);
CREATE INDEX portfolio_item_professional ON beauty.portfolio_collection_items(professional_id);
ALTER TABLE beauty.portfolio_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.portfolio_collections FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.portfolio_asset_presentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.portfolio_asset_presentation FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.portfolio_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.portfolio_collection_items FORCE ROW LEVEL SECURITY;
CREATE POLICY collection_owner ON beauty.portfolio_collections FOR ALL TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=portfolio_collections.professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'))
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=portfolio_collections.professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'));
CREATE POLICY asset_presentation_owner ON beauty.portfolio_asset_presentation FOR ALL TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=portfolio_asset_presentation.professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'))
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=portfolio_asset_presentation.professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'));
CREATE POLICY collection_item_owner ON beauty.portfolio_collection_items FOR ALL TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=portfolio_collection_items.professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'))
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=portfolio_collection_items.professional_id AND u.auth_id=beauty.auth_id() AND u.status='active')
 AND (social_post_id IS NULL OR EXISTS(SELECT 1 FROM beauty.social_portfolio s WHERE s.id=portfolio_collection_items.social_post_id AND s.professional_id=portfolio_collection_items.professional_id)));
CREATE POLICY collection_public ON beauty.portfolio_collections FOR SELECT TO beauty_catalog
 USING(publication_status='published' AND EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=portfolio_collections.professional_id AND p.publication_status='published'));
CREATE POLICY asset_presentation_public ON beauty.portfolio_asset_presentation FOR SELECT TO beauty_catalog
 USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=portfolio_asset_presentation.professional_id AND p.publication_status='published') AND EXISTS(SELECT 1 FROM beauty.public_media_assets a WHERE a.id=portfolio_asset_presentation.asset_id AND a.professional_id=portfolio_asset_presentation.professional_id));
CREATE POLICY collection_item_public ON beauty.portfolio_collection_items FOR SELECT TO beauty_catalog
 USING(EXISTS(SELECT 1 FROM beauty.portfolio_collections c WHERE c.id=portfolio_collection_items.collection_id AND c.professional_id=portfolio_collection_items.professional_id AND c.publication_status='published')
 AND ((asset_id IS NOT NULL AND EXISTS(SELECT 1 FROM beauty.public_media_assets a WHERE a.id=portfolio_collection_items.asset_id AND a.professional_id=portfolio_collection_items.professional_id))
 OR (social_post_id IS NOT NULL AND EXISTS(SELECT 1 FROM beauty.public_social_portfolio s WHERE s.id=portfolio_collection_items.social_post_id AND s.professional_id=portfolio_collection_items.professional_id))));
REVOKE ALL ON beauty.portfolio_collections,beauty.portfolio_asset_presentation,beauty.portfolio_collection_items FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.portfolio_collections,beauty.portfolio_asset_presentation,beauty.portfolio_collection_items TO beauty_app;
GRANT SELECT ON beauty.portfolio_collections,beauty.portfolio_asset_presentation,beauty.portfolio_collection_items TO beauty_catalog;
CREATE VIEW beauty.public_portfolio_collections WITH(security_barrier=true) AS SELECT id,professional_id,name,sort_order FROM beauty.portfolio_collections;
CREATE VIEW beauty.public_portfolio_asset_presentation WITH(security_barrier=true) AS SELECT asset_id,professional_id,featured,sort_order FROM beauty.portfolio_asset_presentation;
CREATE VIEW beauty.public_portfolio_collection_items WITH(security_barrier=true) AS SELECT collection_id,professional_id,asset_id,social_post_id FROM beauty.portfolio_collection_items;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_portfolio_collections OWNER TO beauty_catalog;
ALTER VIEW beauty.public_portfolio_asset_presentation OWNER TO beauty_catalog;
ALTER VIEW beauty.public_portfolio_collection_items OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_portfolio_collections,beauty.public_portfolio_asset_presentation,beauty.public_portfolio_collection_items TO beauty_app;

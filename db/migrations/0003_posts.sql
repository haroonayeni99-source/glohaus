CREATE TABLE beauty.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  service_id uuid,
  kind text NOT NULL CHECK(kind IN ('design','tutorial')),
  title text NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
  body text NOT NULL CHECK(length(body) BETWEEN 20 AND 1800),
  publication_status text NOT NULL DEFAULT 'draft' CHECK(publication_status IN ('draft','published','hidden')),
  moderation_status text NOT NULL DEFAULT 'visible' CHECK(moderation_status IN ('visible','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(service_id,professional_id) REFERENCES beauty.services(id,professional_id)
);
CREATE INDEX posts_professional ON beauty.posts(professional_id);
CREATE INDEX posts_feed ON beauty.posts(created_at DESC,id DESC) WHERE publication_status='published' AND moderation_status='visible';
ALTER TABLE beauty.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.posts FORCE ROW LEVEL SECURITY;
CREATE POLICY post_owner ON beauty.posts FOR ALL TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id))
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
GRANT SELECT ON beauty.posts TO beauty_app;
GRANT INSERT(professional_id,service_id,kind,title,body,publication_status) ON beauty.posts TO beauty_app;
GRANT UPDATE(service_id,kind,title,body,publication_status) ON beauty.posts TO beauty_app;
GRANT SELECT ON beauty.posts TO beauty_catalog;
CREATE POLICY post_public ON beauty.posts FOR SELECT TO beauty_catalog
 USING(publication_status='published' AND moderation_status='visible' AND EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE VIEW beauty.public_posts WITH(security_barrier=true) AS
 SELECT post.id,post.title,post.body,post.kind,post.created_at,p.slug,p.business_name,p.category,p.city,s.id AS service_id,s.name AS service_name,s.price_pence
 FROM beauty.posts post JOIN beauty.professional_profiles p ON p.id=post.professional_id
 LEFT JOIN beauty.services s ON s.id=post.service_id AND s.professional_id=post.professional_id;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_posts OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_posts TO beauty_app;

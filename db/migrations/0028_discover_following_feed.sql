-- Expose the public professional identifier on public feed posts so
-- Discover can connect posts to the existing secure follow system.
-- No private account or follower identity is exposed.
CREATE OR REPLACE VIEW beauty.public_posts WITH(security_barrier=true) AS
 SELECT
   post.id,
   post.title,
   post.body,
   post.kind,
   post.created_at,
   p.slug,
   p.business_name,
   p.category,
   p.city,
   s.id AS service_id,
   s.name AS service_name,
   s.price_pence,
   asset.id AS asset_id,
   p.id AS professional_id
 FROM beauty.posts post
 JOIN beauty.professional_profiles p ON p.id=post.professional_id
 LEFT JOIN beauty.services s
   ON s.id=post.service_id AND s.professional_id=post.professional_id
 LEFT JOIN beauty.portfolio_assets asset
   ON asset.id=post.asset_id AND asset.professional_id=post.professional_id;

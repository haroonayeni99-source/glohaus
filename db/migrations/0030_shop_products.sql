-- Product catalogue foundation for the GLOHAUS marketplace.
-- This migration does not create customer orders or charge payments.
CREATE TABLE beauty.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  image_asset_id uuid,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK(length(description) <= 1200),
  sku text CHECK(sku IS NULL OR length(trim(sku)) BETWEEN 1 AND 80),
  price_pence integer NOT NULL CHECK(price_pence BETWEEN 50 AND 100000000),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK(stock_quantity BETWEEN 0 AND 1000000),
  publication_status text NOT NULL DEFAULT 'draft'
    CHECK(publication_status IN('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,professional_id),
  UNIQUE(professional_id,sku),
  FOREIGN KEY(image_asset_id,professional_id)
    REFERENCES beauty.portfolio_assets(id,professional_id)
);

CREATE INDEX products_professional
  ON beauty.products(professional_id,updated_at DESC);
CREATE INDEX products_public
  ON beauty.products(updated_at DESC,id DESC)
  WHERE publication_status='published';

ALTER TABLE beauty.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.products FORCE ROW LEVEL SECURITY;

CREATE POLICY products_owner ON beauty.products
FOR ALL TO beauty_app
USING (
  EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
)
WITH CHECK (
  EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

GRANT SELECT ON beauty.products TO beauty_app;
GRANT INSERT(
  professional_id,image_asset_id,name,description,sku,
  price_pence,stock_quantity,publication_status
) ON beauty.products TO beauty_app;
GRANT UPDATE(
  image_asset_id,name,description,sku,price_pence,
  stock_quantity,publication_status,updated_at
) ON beauty.products TO beauty_app;

GRANT SELECT ON beauty.products TO beauty_catalog;
CREATE POLICY catalog_published_products ON beauty.products
FOR SELECT TO beauty_catalog
USING (
  publication_status='published'
  AND EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND p.publication_status='published'
      AND u.status='active'
  )
);

CREATE VIEW beauty.public_products WITH(security_barrier=true) AS
SELECT
  product.id,
  product.professional_id,
  product.name,
  product.description,
  product.price_pence,
  (product.stock_quantity > 0) AS in_stock,
  product.image_asset_id,
  professional.slug AS professional_slug,
  professional.business_name AS professional_name,
  product.updated_at
FROM beauty.products product
JOIN beauty.professional_profiles professional
  ON professional.id=product.professional_id
WHERE product.publication_status='published';

GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_products OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_products TO beauty_app;

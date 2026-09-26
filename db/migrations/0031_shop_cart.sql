-- Customer cart foundation for published marketplace products.
-- This migration deliberately does not create orders or capture payments.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='beauty_cart_ops') THEN
    CREATE ROLE beauty_cart_ops NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT beauty_cart_ops TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_cart_ops;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_cart_ops;

CREATE TABLE beauty.cart_items (
  customer_id uuid NOT NULL REFERENCES beauty.users(id),
  product_id uuid NOT NULL REFERENCES beauty.products(id),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(customer_id,product_id)
);

CREATE INDEX cart_items_customer_updated
  ON beauty.cart_items(customer_id,updated_at DESC);

ALTER TABLE beauty.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.cart_items FORCE ROW LEVEL SECURITY;

CREATE POLICY cart_self_read ON beauty.cart_items
FOR SELECT TO beauty_app
USING (
  EXISTS(
    SELECT 1
    FROM beauty.users u
    JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
    WHERE u.id=customer_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

GRANT SELECT ON beauty.cart_items TO beauty_app;

GRANT SELECT ON beauty.users,beauty.user_roles,beauty.professional_profiles,beauty.products
  TO beauty_cart_ops;
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.cart_items TO beauty_cart_ops;

CREATE POLICY cart_ops_users ON beauty.users
FOR SELECT TO beauty_cart_ops USING(true);
CREATE POLICY cart_ops_roles ON beauty.user_roles
FOR SELECT TO beauty_cart_ops USING(true);
CREATE POLICY cart_ops_profiles ON beauty.professional_profiles
FOR SELECT TO beauty_cart_ops USING(true);
CREATE POLICY cart_ops_products ON beauty.products
FOR SELECT TO beauty_cart_ops USING(true);
CREATE POLICY cart_ops_items ON beauty.cart_items
FOR ALL TO beauty_cart_ops USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.my_cart() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor uuid;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  IF actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  RETURN jsonb_build_object(
    'items',
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'productId',p.id,
          'professionalId',p.professional_id,
          'professionalName',pro.business_name,
          'professionalSlug',pro.slug,
          'imageAssetId',p.image_asset_id,
          'name',p.name,
          'pricePence',p.price_pence,
          'quantity',ci.quantity,
          'available',
            p.publication_status='published'
            AND p.stock_quantity>0
            AND pro.publication_status='published'
            AND owner.status='active',
          'inStockForQuantity',
            p.publication_status='published'
            AND p.stock_quantity>=ci.quantity
            AND pro.publication_status='published'
            AND owner.status='active'
        )
        ORDER BY ci.updated_at DESC,p.id
      )
      FROM beauty.cart_items ci
      JOIN beauty.products p ON p.id=ci.product_id
      JOIN beauty.professional_profiles pro ON pro.id=p.professional_id
      JOIN beauty.users owner ON owner.id=pro.user_id
      WHERE ci.customer_id=actor
    ),'[]'::jsonb),
    'totalPence',
    coalesce((
      SELECT sum(p.price_pence*ci.quantity)::bigint
      FROM beauty.cart_items ci
      JOIN beauty.products p ON p.id=ci.product_id
      JOIN beauty.professional_profiles pro ON pro.id=p.professional_id
      JOIN beauty.users owner ON owner.id=pro.user_id
      WHERE ci.customer_id=actor
        AND p.publication_status='published'
        AND p.stock_quantity>=ci.quantity
        AND pro.publication_status='published'
        AND owner.status='active'
    ),0),
    'itemCount',
    coalesce((
      SELECT sum(ci.quantity)::integer
      FROM beauty.cart_items ci
      WHERE ci.customer_id=actor
    ),0)
  );
END $$;

CREATE FUNCTION beauty.set_cart_item(
  target_product uuid,
  next_quantity integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor beauty.users;
  product beauty.products;
  owner_user uuid;
BEGIN
  SELECT u.* INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF next_quantity IS NULL OR next_quantity<0 OR next_quantity>20 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023';
  END IF;

  SELECT p.* INTO product
  FROM beauty.products p
  JOIN beauty.professional_profiles pro ON pro.id=p.professional_id
  JOIN beauty.users u ON u.id=pro.user_id
  WHERE p.id=target_product
    AND p.publication_status='published'
    AND pro.publication_status='published'
    AND u.status='active'
  FOR SHARE OF p;

  IF product.id IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE='22023';
  END IF;

  SELECT pro.user_id INTO owner_user
  FROM beauty.professional_profiles pro
  WHERE pro.id=product.professional_id;

  IF owner_user=actor.id THEN
    RAISE EXCEPTION 'SELF_PURCHASE_NOT_ALLOWED' USING ERRCODE='22023';
  END IF;

  IF next_quantity=0 THEN
    DELETE FROM beauty.cart_items
    WHERE customer_id=actor.id
      AND product_id=target_product;
    RETURN beauty.my_cart();
  END IF;

  IF product.stock_quantity<next_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.cart_items(customer_id,product_id,quantity)
  VALUES(actor.id,target_product,next_quantity)
  ON CONFLICT(customer_id,product_id)
  DO UPDATE SET quantity=excluded.quantity,updated_at=now();

  RETURN beauty.my_cart();
END $$;

CREATE FUNCTION beauty.clear_cart() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE actor uuid;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  IF actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  DELETE FROM beauty.cart_items WHERE customer_id=actor;
  RETURN beauty.my_cart();
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_cart_ops;
ALTER FUNCTION beauty.my_cart() OWNER TO beauty_cart_ops;
ALTER FUNCTION beauty.set_cart_item(uuid,integer) OWNER TO beauty_cart_ops;
ALTER FUNCTION beauty.clear_cart() OWNER TO beauty_cart_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_cart_ops;

REVOKE ALL ON FUNCTION beauty.my_cart(),beauty.set_cart_item(uuid,integer),beauty.clear_cart()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.my_cart(),beauty.set_cart_item(uuid,integer),beauty.clear_cart()
  TO beauty_app;

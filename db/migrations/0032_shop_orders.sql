-- Marketplace order and fulfilment foundation.
-- Paid orders will be created only by a future verified payment-worker flow.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='beauty_order_ops') THEN
    CREATE ROLE beauty_order_ops NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT beauty_order_ops TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_order_ops;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_order_ops;

CREATE TABLE beauty.product_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_reference uuid NOT NULL,
  provider_payment_intent_id text NOT NULL
    CHECK(length(provider_payment_intent_id) BETWEEN 3 AND 255),
  customer_id uuid NOT NULL REFERENCES beauty.users(id),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  currency text NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
  subtotal_pence integer NOT NULL CHECK(subtotal_pence>0),
  delivery_pence integer NOT NULL DEFAULT 0 CHECK(delivery_pence>=0),
  total_pence integer NOT NULL CHECK(total_pence=subtotal_pence+delivery_pence),
  status text NOT NULL DEFAULT 'paid'
    CHECK(status IN(
      'paid','processing','shipped','delivered',
      'cancelled','refund_pending','refunded'
    )),
  recipient_name text NOT NULL CHECK(length(trim(recipient_name)) BETWEEN 1 AND 120),
  address_line1 text NOT NULL CHECK(length(trim(address_line1)) BETWEEN 1 AND 160),
  address_line2 text CHECK(address_line2 IS NULL OR length(trim(address_line2))<=160),
  city text NOT NULL CHECK(length(trim(city)) BETWEEN 1 AND 100),
  postcode text NOT NULL CHECK(length(trim(postcode)) BETWEEN 2 AND 20),
  country_code text NOT NULL CHECK(country_code ~ '^[A-Z]{2}$'),
  tracking_carrier text CHECK(
    tracking_carrier IS NULL OR length(trim(tracking_carrier)) BETWEEN 2 AND 80
  ),
  tracking_number text CHECK(
    tracking_number IS NULL OR length(trim(tracking_number)) BETWEEN 3 AND 120
  ),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(checkout_reference,professional_id)
);

CREATE INDEX product_orders_customer_recent
  ON beauty.product_orders(customer_id,created_at DESC,id DESC);
CREATE INDEX product_orders_professional_recent
  ON beauty.product_orders(professional_id,created_at DESC,id DESC);
CREATE INDEX product_orders_payment_intent
  ON beauty.product_orders(provider_payment_intent_id);

CREATE TABLE beauty.product_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES beauty.product_orders(id),
  product_id uuid NOT NULL REFERENCES beauty.products(id),
  product_name text NOT NULL CHECK(length(trim(product_name)) BETWEEN 2 AND 120),
  image_asset_id uuid,
  unit_price_pence integer NOT NULL CHECK(unit_price_pence>0),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  line_total_pence integer NOT NULL
    CHECK(line_total_pence=unit_price_pence*quantity),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_order_items_order
  ON beauty.product_order_items(order_id,id);

ALTER TABLE beauty.product_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.product_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.product_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.product_order_items FORCE ROW LEVEL SECURITY;

CREATE POLICY product_order_participant_read ON beauty.product_orders
FOR SELECT TO beauty_app
USING (
  EXISTS(
    SELECT 1 FROM beauty.users u
    WHERE u.id=customer_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
  OR EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

CREATE POLICY product_order_item_participant_read ON beauty.product_order_items
FOR SELECT TO beauty_app
USING (
  EXISTS(
    SELECT 1
    FROM beauty.product_orders o
    WHERE o.id=order_id
  )
);

GRANT SELECT ON beauty.product_orders,beauty.product_order_items TO beauty_app;

GRANT SELECT ON beauty.users,beauty.professional_profiles
  TO beauty_order_ops;
GRANT SELECT,UPDATE ON beauty.product_orders TO beauty_order_ops;
GRANT SELECT ON beauty.product_order_items TO beauty_order_ops;

CREATE POLICY order_ops_users ON beauty.users
FOR SELECT TO beauty_order_ops USING(true);
CREATE POLICY order_ops_profiles ON beauty.professional_profiles
FOR SELECT TO beauty_order_ops USING(true);
CREATE POLICY order_ops_orders ON beauty.product_orders
FOR ALL TO beauty_order_ops USING(true) WITH CHECK(true);
CREATE POLICY order_ops_items ON beauty.product_order_items
FOR SELECT TO beauty_order_ops USING(true);

CREATE FUNCTION beauty.advance_product_order(
  target_order uuid,
  next_status text,
  next_carrier text DEFAULT NULL,
  next_tracking text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $order$
DECLARE
  actor uuid;
  actor_professional uuid;
  target beauty.product_orders;
BEGIN
  SELECT u.id,p.id INTO actor,actor_professional
  FROM beauty.users u
  JOIN beauty.professional_profiles p ON p.user_id=u.id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  SELECT * INTO target
  FROM beauty.product_orders
  WHERE id=target_order
  FOR UPDATE;

  IF actor IS NULL
    OR actor_professional IS NULL
    OR target.id IS NULL
    OR target.professional_id<>actor_professional THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF next_status='processing' AND target.status='paid' THEN
    UPDATE beauty.product_orders
    SET status='processing',updated_at=now()
    WHERE id=target_order;
  ELSIF next_status='shipped'
    AND target.status IN('paid','processing')
    AND length(trim(coalesce(next_carrier,''))) BETWEEN 2 AND 80
    AND length(trim(coalesce(next_tracking,''))) BETWEEN 3 AND 120 THEN
    UPDATE beauty.product_orders
    SET
      status='shipped',
      tracking_carrier=trim(next_carrier),
      tracking_number=trim(next_tracking),
      shipped_at=now(),
      updated_at=now()
    WHERE id=target_order;
  ELSE
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023';
  END IF;

  SELECT * INTO target FROM beauty.product_orders WHERE id=target_order;
  RETURN jsonb_build_object(
    'id',target.id,
    'status',target.status,
    'trackingCarrier',target.tracking_carrier,
    'trackingNumber',target.tracking_number,
    'shippedAt',target.shipped_at
  );
END $order$;

GRANT CREATE ON SCHEMA beauty TO beauty_order_ops;
ALTER FUNCTION beauty.advance_product_order(uuid,text,text,text)
  OWNER TO beauty_order_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_order_ops;

REVOKE ALL ON FUNCTION beauty.advance_product_order(uuid,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.advance_product_order(uuid,text,text,text)
  TO beauty_app;

-- The application role deliberately has no INSERT/UPDATE/DELETE grants on
-- product order tables. A later verified payment-worker migration will own
-- paid-order creation and stock reservation.

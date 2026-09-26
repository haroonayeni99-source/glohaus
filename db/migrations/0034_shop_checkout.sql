-- Secure Stripe Checkout reservation and verified paid-order creation for the multi-seller Shop.
-- Customer checkout uses a platform charge. Seller transfers remain separate and delayed.

CREATE TABLE beauty.shop_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES beauty.users(id),
  integration_identifier text NOT NULL DEFAULT ('glohaus_shop_' || translate(substr(md5(gen_random_uuid()::text),1,8),'0123456789','klmnopqrst')),
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  fee_rule_id uuid REFERENCES beauty.financial_fee_rules(id),
  fee_percentage_basis_points integer NOT NULL CHECK(fee_percentage_basis_points BETWEEN 0 AND 10000),
  fee_fixed_pence integer NOT NULL DEFAULT 0 CHECK(fee_fixed_pence BETWEEN 0 AND 100000),
  fee_minimum_pence integer NOT NULL DEFAULT 0 CHECK(fee_minimum_pence BETWEEN 0 AND 100000),
  fee_maximum_pence integer CHECK(fee_maximum_pence IS NULL OR fee_maximum_pence BETWEEN 0 AND 100000),
  currency text NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
  amount_pence integer NOT NULL CHECK(amount_pence>0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK(status IN('reserved','checkout_created','paid','expired','failed')),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX shop_checkout_one_active_customer
  ON beauty.shop_checkouts(customer_id)
  WHERE status IN('reserved','checkout_created');

CREATE TABLE beauty.shop_checkout_items (
  checkout_id uuid NOT NULL REFERENCES beauty.shop_checkouts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES beauty.products(id),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  professional_name text NOT NULL CHECK(length(trim(professional_name)) BETWEEN 1 AND 100),
  image_asset_id uuid,
  product_name text NOT NULL CHECK(length(trim(product_name)) BETWEEN 2 AND 120),
  unit_price_pence integer NOT NULL CHECK(unit_price_pence>0),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  line_total_pence integer NOT NULL CHECK(line_total_pence=unit_price_pence*quantity),
  PRIMARY KEY(checkout_id,product_id)
);

ALTER TABLE beauty.product_orders
  ADD COLUMN fee_rule_id uuid REFERENCES beauty.financial_fee_rules(id),
  ADD COLUMN platform_fee_pence integer NOT NULL DEFAULT 0 CHECK(platform_fee_pence>=0),
  ADD COLUMN professional_proceeds_pence integer NOT NULL DEFAULT 0 CHECK(professional_proceeds_pence>=0);

ALTER TABLE beauty.shop_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.shop_checkouts FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.shop_checkout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.shop_checkout_items FORCE ROW LEVEL SECURITY;

-- PostgreSQL 16+ requires SET permission before transferring function ownership.
GRANT beauty_payment_worker TO postgres WITH INHERIT TRUE, SET TRUE;

GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_payment_worker;
GRANT SELECT,INSERT,UPDATE ON beauty.shop_checkouts,beauty.shop_checkout_items TO beauty_payment_worker;
GRANT SELECT,UPDATE ON beauty.products TO beauty_payment_worker;
GRANT SELECT,UPDATE,DELETE ON beauty.cart_items TO beauty_payment_worker;
GRANT SELECT ON beauty.users,beauty.user_roles,beauty.professional_profiles,beauty.professional_financial_controls,beauty.financial_fee_rules TO beauty_payment_worker;
GRANT SELECT,INSERT,UPDATE ON beauty.product_orders,beauty.product_order_items TO beauty_payment_worker;
GRANT SELECT,INSERT ON beauty.payment_events TO beauty_payment_worker;

CREATE POLICY shop_checkout_worker ON beauty.shop_checkouts
FOR ALL TO beauty_payment_worker USING(true) WITH CHECK(true);
CREATE POLICY shop_checkout_items_worker ON beauty.shop_checkout_items
FOR ALL TO beauty_payment_worker USING(true) WITH CHECK(true);
CREATE POLICY shop_products_payment_worker ON beauty.products
FOR ALL TO beauty_payment_worker USING(true) WITH CHECK(true);
CREATE POLICY shop_cart_payment_worker ON beauty.cart_items
FOR ALL TO beauty_payment_worker USING(true) WITH CHECK(true);
CREATE POLICY shop_users_payment_worker ON beauty.users
FOR SELECT TO beauty_payment_worker USING(true);
CREATE POLICY shop_roles_payment_worker ON beauty.user_roles
FOR SELECT TO beauty_payment_worker USING(true);
CREATE POLICY shop_profiles_payment_worker ON beauty.professional_profiles
FOR SELECT TO beauty_payment_worker USING(true);
CREATE POLICY shop_controls_payment_worker ON beauty.professional_financial_controls
FOR SELECT TO beauty_payment_worker USING(true);
CREATE POLICY shop_fee_rules_payment_worker ON beauty.financial_fee_rules
FOR SELECT TO beauty_payment_worker USING(true);
CREATE POLICY shop_orders_payment_worker ON beauty.product_orders
FOR ALL TO beauty_payment_worker USING(true) WITH CHECK(true);
CREATE POLICY shop_order_items_payment_worker ON beauty.product_order_items
FOR ALL TO beauty_payment_worker USING(true) WITH CHECK(true);
CREATE POLICY shop_payment_events_worker ON beauty.payment_events
FOR ALL TO beauty_payment_worker USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.shop_checkout_payload(target uuid) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object(
    'id',c.id,
    'stripeSessionId',c.stripe_session_id,
    'integrationIdentifier',c.integration_identifier,
    'expiresAt',c.expires_at,
    'totalPence',c.amount_pence,
    'itemCount',coalesce((SELECT sum(i.quantity)::integer FROM beauty.shop_checkout_items i WHERE i.checkout_id=c.id),0),
    'items',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'productId',i.product_id,
        'professionalId',i.professional_id,
        'professionalName',i.professional_name,
        'name',i.product_name,
        'pricePence',i.unit_price_pence,
        'quantity',i.quantity
      ) ORDER BY i.product_name,i.product_id)
      FROM beauty.shop_checkout_items i
      WHERE i.checkout_id=c.id
    ),'[]'::jsonb)
  )
  FROM beauty.shop_checkouts c
  WHERE c.id=target
$$;

CREATE FUNCTION beauty.release_shop_checkout(
  target uuid,
  session_ref text,
  next_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE checkout_row beauty.shop_checkouts;
BEGIN
  IF next_status NOT IN('expired','failed') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE='22023';
  END IF;

  SELECT * INTO checkout_row
  FROM beauty.shop_checkouts
  WHERE id=target
  FOR UPDATE;

  IF checkout_row.id IS NULL OR checkout_row.status IN('paid','expired','failed') THEN
    RETURN;
  END IF;

  IF session_ref IS NOT NULL
    AND checkout_row.stripe_session_id IS DISTINCT FROM session_ref THEN
    RAISE EXCEPTION 'CHECKOUT_MISMATCH' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.products p
  SET stock_quantity=p.stock_quantity+i.quantity,
      updated_at=now()
  FROM beauty.shop_checkout_items i
  WHERE i.checkout_id=target
    AND i.product_id=p.id;

  UPDATE beauty.shop_checkouts
  SET status=next_status,updated_at=now()
  WHERE id=target;
END $$;

CREATE FUNCTION beauty.prepare_shop_checkout() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor uuid;
  existing uuid;
  checkout_id uuid;
  total integer;
  fee beauty.financial_fee_rules;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  IF actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  FOR existing IN
    SELECT id FROM beauty.shop_checkouts
    WHERE customer_id=actor
      AND status IN('reserved','checkout_created')
      AND expires_at<=now()
    FOR UPDATE
  LOOP
    PERFORM beauty.release_shop_checkout(existing,NULL,'expired');
  END LOOP;

  SELECT id INTO existing
  FROM beauty.shop_checkouts
  WHERE customer_id=actor
    AND status IN('reserved','checkout_created')
    AND expires_at>now()
  LIMIT 1;

  IF existing IS NOT NULL THEN
    RETURN beauty.shop_checkout_payload(existing);
  END IF;

  SELECT * INTO fee
  FROM beauty.financial_fee_rules
  WHERE transaction_kind='product'
    AND category_key IS NULL
    AND fee_payer='professional'
    AND active
    AND effective_from<=now()
    AND (effective_until IS NULL OR effective_until>now())
  ORDER BY effective_from DESC,id DESC
  LIMIT 1;

  IF fee.id IS NULL THEN
    RAISE EXCEPTION 'SHOP_FEE_RULE_REQUIRED' USING ERRCODE='22023';
  END IF;

  PERFORM 1
  FROM beauty.products p
  JOIN beauty.cart_items ci ON ci.product_id=p.id
  WHERE ci.customer_id=actor
  ORDER BY p.id
  FOR UPDATE OF p;

  IF NOT EXISTS(SELECT 1 FROM beauty.cart_items WHERE customer_id=actor) THEN
    RAISE EXCEPTION 'EMPTY_CART' USING ERRCODE='22023';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM beauty.cart_items ci
    JOIN beauty.products p ON p.id=ci.product_id
    JOIN beauty.professional_profiles pro ON pro.id=p.professional_id
    JOIN beauty.users owner ON owner.id=pro.user_id
    LEFT JOIN beauty.professional_financial_controls controls
      ON controls.professional_id=pro.id
    WHERE ci.customer_id=actor
      AND (
        p.publication_status<>'published'
        OR p.stock_quantity<ci.quantity
        OR pro.publication_status<>'published'
        OR owner.status<>'active'
        OR coalesce(controls.selling_blocked,false)
      )
  ) THEN
    RAISE EXCEPTION 'CART_UNAVAILABLE' USING ERRCODE='22023';
  END IF;

  SELECT sum(p.price_pence*ci.quantity)::integer INTO total
  FROM beauty.cart_items ci
  JOIN beauty.products p ON p.id=ci.product_id
  WHERE ci.customer_id=actor;

  INSERT INTO beauty.shop_checkouts(
    customer_id,fee_rule_id,fee_percentage_basis_points,fee_fixed_pence,
    fee_minimum_pence,fee_maximum_pence,amount_pence,expires_at
  ) VALUES(
    actor,fee.id,fee.percentage_basis_points,fee.fixed_fee_pence,
    fee.minimum_fee_pence,fee.maximum_fee_pence,total,now()+interval '40 minutes'
  ) RETURNING id INTO checkout_id;

  INSERT INTO beauty.shop_checkout_items(
    checkout_id,product_id,professional_id,professional_name,image_asset_id,
    product_name,unit_price_pence,quantity,line_total_pence
  )
  SELECT
    checkout_id,p.id,p.professional_id,pro.business_name,p.image_asset_id,
    p.name,p.price_pence,ci.quantity,p.price_pence*ci.quantity
  FROM beauty.cart_items ci
  JOIN beauty.products p ON p.id=ci.product_id
  JOIN beauty.professional_profiles pro ON pro.id=p.professional_id
  WHERE ci.customer_id=actor;

  UPDATE beauty.products p
  SET stock_quantity=p.stock_quantity-ci.quantity,
      updated_at=now()
  FROM beauty.cart_items ci
  WHERE ci.customer_id=actor
    AND ci.product_id=p.id;

  RETURN beauty.shop_checkout_payload(checkout_id);
END $$;

CREATE FUNCTION beauty.attach_shop_checkout_session(
  target uuid,
  session_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE actor uuid; checkout_row beauty.shop_checkouts;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  SELECT * INTO checkout_row
  FROM beauty.shop_checkouts
  WHERE id=target
  FOR UPDATE;

  IF actor IS NULL
    OR checkout_row.id IS NULL
    OR checkout_row.customer_id<>actor
    OR checkout_row.status NOT IN('reserved','checkout_created')
    OR checkout_row.expires_at<=now()
    OR length(trim(coalesce(session_ref,'')))<3 THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF checkout_row.stripe_session_id IS NOT NULL
    AND checkout_row.stripe_session_id IS DISTINCT FROM session_ref THEN
    RAISE EXCEPTION 'CHECKOUT_MISMATCH' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.shop_checkouts
  SET stripe_session_id=session_ref,status='checkout_created',updated_at=now()
  WHERE id=target;

  RETURN beauty.shop_checkout_payload(target);
END $$;

CREATE FUNCTION beauty.release_unattached_shop_checkout(target uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE actor uuid; checkout_row beauty.shop_checkouts;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  SELECT * INTO checkout_row
  FROM beauty.shop_checkouts
  WHERE id=target
  FOR UPDATE;

  IF actor IS NULL
    OR checkout_row.id IS NULL
    OR checkout_row.customer_id<>actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF checkout_row.status='reserved'
    AND checkout_row.stripe_session_id IS NULL THEN
    PERFORM beauty.release_shop_checkout(target,NULL,'failed');
  END IF;
END $$;

CREATE FUNCTION beauty.apply_shop_checkout_payment(
  event_ref text,
  target uuid,
  session_ref text,
  intent_ref text,
  amount integer,
  currency_code text,
  shipping jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  checkout_row beauty.shop_checkouts;
  seller record;
  result_order uuid;
  seller_fee integer;
  seller_proceeds integer;
  ship_name text;
  ship_line1 text;
  ship_line2 text;
  ship_city text;
  ship_postcode text;
  ship_country text;
BEGIN
  IF EXISTS(SELECT 1 FROM beauty.payment_events WHERE event_id=event_ref) THEN
    RETURN jsonb_build_object('status','duplicate');
  END IF;

  SELECT * INTO checkout_row
  FROM beauty.shop_checkouts
  WHERE id=target
  FOR UPDATE;

  IF checkout_row.id IS NULL
    OR checkout_row.stripe_session_id IS DISTINCT FROM session_ref
    OR checkout_row.status NOT IN('reserved','checkout_created','paid')
    OR amount IS DISTINCT FROM checkout_row.amount_pence
    OR currency_code IS DISTINCT FROM 'gbp'
    OR intent_ref IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE='22023';
  END IF;

  IF checkout_row.status='paid' THEN
    INSERT INTO beauty.payment_events(event_id) VALUES(event_ref) ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('status','paid');
  END IF;

  ship_name:=nullif(trim(shipping->>'name'),'');
  ship_line1:=nullif(trim(shipping#>>'{address,line1}'),'');
  ship_line2:=nullif(trim(shipping#>>'{address,line2}'),'');
  ship_city:=nullif(trim(shipping#>>'{address,city}'),'');
  ship_postcode:=nullif(trim(shipping#>>'{address,postal_code}'),'');
  ship_country:=upper(nullif(trim(shipping#>>'{address,country}'),''));

  IF ship_name IS NULL OR ship_line1 IS NULL OR ship_city IS NULL
    OR ship_postcode IS NULL OR ship_country<>'GB' THEN
    RAISE EXCEPTION 'SHIPPING_REQUIRED' USING ERRCODE='22023';
  END IF;

  FOR seller IN
    SELECT
      professional_id,
      min(professional_name) AS professional_name,
      sum(line_total_pence)::integer AS subtotal
    FROM beauty.shop_checkout_items
    WHERE checkout_id=target
    GROUP BY professional_id
  LOOP
    seller_fee :=
      (seller.subtotal * checkout_row.fee_percentage_basis_points) / 10000
      + checkout_row.fee_fixed_pence;
    seller_fee:=greatest(seller_fee,checkout_row.fee_minimum_pence);
    IF checkout_row.fee_maximum_pence IS NOT NULL THEN
      seller_fee:=least(seller_fee,checkout_row.fee_maximum_pence);
    END IF;
    seller_fee:=least(seller_fee,seller.subtotal);
    seller_proceeds:=seller.subtotal-seller_fee;

    INSERT INTO beauty.product_orders(
      checkout_reference,provider_payment_intent_id,
      customer_id,professional_id,professional_name,
      subtotal_pence,delivery_pence,total_pence,
      recipient_name,address_line1,address_line2,city,postcode,country_code,
      fee_rule_id,platform_fee_pence,professional_proceeds_pence
    ) VALUES(
      target,intent_ref,
      checkout_row.customer_id,seller.professional_id,seller.professional_name,
      seller.subtotal,0,seller.subtotal,
      ship_name,ship_line1,ship_line2,ship_city,ship_postcode,ship_country,
      checkout_row.fee_rule_id,seller_fee,seller_proceeds
    )
    ON CONFLICT(checkout_reference,professional_id) DO UPDATE
      SET provider_payment_intent_id=excluded.provider_payment_intent_id
    RETURNING id INTO result_order;

    INSERT INTO beauty.product_order_items(
      order_id,product_id,product_name,image_asset_id,
      unit_price_pence,quantity,line_total_pence
    )
    SELECT
      result_order,i.product_id,i.product_name,i.image_asset_id,
      i.unit_price_pence,i.quantity,i.line_total_pence
    FROM beauty.shop_checkout_items i
    WHERE i.checkout_id=target
      AND i.professional_id=seller.professional_id
      AND NOT EXISTS(
        SELECT 1 FROM beauty.product_order_items existing
        WHERE existing.order_id=result_order
          AND existing.product_id=i.product_id
      );

    PERFORM beauty.record_financial_ledger(
      event_ref||':'||seller.professional_id::text,
      'proceeds_pending',
      'product_order',
      result_order,
      seller.professional_id,
      jsonb_build_object(
        'checkoutId',target,
        'paymentIntentId',intent_ref,
        'platformFeePence',seller_fee
      ),
      CASE
        WHEN seller_fee>0 THEN jsonb_build_array(
          jsonb_build_object('accountCode','provider_clearing','amountPence',seller.subtotal),
          jsonb_build_object('accountCode','platform_fee_revenue','amountPence',-seller_fee),
          jsonb_build_object('accountCode','professional_pending','amountPence',-seller_proceeds)
        )
        ELSE jsonb_build_array(
          jsonb_build_object('accountCode','provider_clearing','amountPence',seller.subtotal),
          jsonb_build_object('accountCode','professional_pending','amountPence',-seller.subtotal)
        )
      END
    );
  END LOOP;

  UPDATE beauty.shop_checkouts
  SET status='paid',
      stripe_payment_intent_id=intent_ref,
      paid_at=now(),
      updated_at=now()
  WHERE id=target;

  UPDATE beauty.cart_items ci
  SET quantity=ci.quantity-i.quantity,updated_at=now()
  FROM beauty.shop_checkout_items i
  WHERE i.checkout_id=target
    AND ci.customer_id=checkout_row.customer_id
    AND ci.product_id=i.product_id
    AND ci.quantity>i.quantity;

  DELETE FROM beauty.cart_items ci
  USING beauty.shop_checkout_items i
  WHERE i.checkout_id=target
    AND ci.customer_id=checkout_row.customer_id
    AND ci.product_id=i.product_id
    AND ci.quantity<=i.quantity;

  INSERT INTO beauty.payment_events(event_id) VALUES(event_ref) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('status','paid');
END $$;

CREATE FUNCTION beauty.owner_active_product_fee_rule() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $owner$
DECLARE actor uuid;
BEGIN
  actor:=beauty.require_owner();
  RETURN (
    SELECT jsonb_build_object(
      'id',id,
      'percentageBasisPoints',percentage_basis_points,
      'fixedFeePence',fixed_fee_pence,
      'minimumFeePence',minimum_fee_pence,
      'maximumFeePence',maximum_fee_pence,
      'minimumTransactionPence',minimum_transaction_pence,
      'processingCostPayer',processing_cost_payer,
      'effectiveFrom',effective_from
    )
    FROM beauty.financial_fee_rules
    WHERE transaction_kind='product'
      AND category_key IS NULL
      AND fee_payer='professional'
      AND active
      AND effective_from<=now()
      AND (effective_until IS NULL OR effective_until>now())
    ORDER BY effective_from DESC,id DESC
    LIMIT 1
  );
END $owner$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_active_product_fee_rule() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.owner_active_product_fee_rule() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.owner_active_product_fee_rule() TO beauty_app;

GRANT CREATE ON SCHEMA beauty TO beauty_payment_worker;
ALTER FUNCTION beauty.shop_checkout_payload(uuid) OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.release_shop_checkout(uuid,text,text) OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.prepare_shop_checkout() OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.attach_shop_checkout_session(uuid,text) OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.release_unattached_shop_checkout(uuid) OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.apply_shop_checkout_payment(text,uuid,text,text,integer,text,jsonb) OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_payment_worker;

REVOKE ALL ON FUNCTION
  beauty.shop_checkout_payload(uuid),
  beauty.release_shop_checkout(uuid,text,text),
  beauty.prepare_shop_checkout(),
  beauty.attach_shop_checkout_session(uuid,text),
  beauty.release_unattached_shop_checkout(uuid),
  beauty.apply_shop_checkout_payment(text,uuid,text,text,integer,text,jsonb)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  beauty.prepare_shop_checkout(),
  beauty.attach_shop_checkout_session(uuid,text),
  beauty.release_unattached_shop_checkout(uuid)
TO beauty_app;

GRANT EXECUTE ON FUNCTION
  beauty.release_shop_checkout(uuid,text,text),
  beauty.apply_shop_checkout_payment(text,uuid,text,text,integer,text,jsonb)
TO beauty_payment_worker;

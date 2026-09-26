-- Customer-confirmed delivery and protected 48-hour product proceeds release.

GRANT SELECT ON beauty.product_orders TO beauty_financial_worker;
CREATE POLICY finance_worker_product_orders ON beauty.product_orders
FOR SELECT TO beauty_financial_worker USING(true);

CREATE FUNCTION beauty.confirm_product_order_delivery(target uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE actor uuid; target_order beauty.product_orders;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  SELECT * INTO target_order
  FROM beauty.product_orders
  WHERE id=target
  FOR UPDATE;

  IF actor IS NULL
    OR target_order.id IS NULL
    OR target_order.customer_id<>actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF target_order.status='delivered' THEN
    RETURN jsonb_build_object(
      'id',target_order.id,
      'status',target_order.status,
      'deliveredAt',target_order.delivered_at
    );
  END IF;

  IF target_order.status<>'shipped'
    OR target_order.tracking_carrier IS NULL
    OR target_order.tracking_number IS NULL THEN
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.product_orders
  SET status='delivered',delivered_at=now(),updated_at=now()
  WHERE id=target
  RETURNING * INTO target_order;

  RETURN jsonb_build_object(
    'id',target_order.id,
    'status',target_order.status,
    'deliveredAt',target_order.delivered_at
  );
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_order_ops;
ALTER FUNCTION beauty.confirm_product_order_delivery(uuid) OWNER TO beauty_order_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_order_ops;
REVOKE ALL ON FUNCTION beauty.confirm_product_order_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.confirm_product_order_delivery(uuid) TO beauty_app;

CREATE FUNCTION beauty.release_my_mature_product_proceeds() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE target_professional uuid; target_order record; released_count integer:=0;
BEGIN
  SELECT p.id INTO target_professional
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  IF target_professional IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  FOR target_order IN
    SELECT o.id,o.professional_proceeds_pence,o.delivered_at
    FROM beauty.product_orders o
    WHERE o.professional_id=target_professional
      AND o.status='delivered'
      AND o.delivered_at IS NOT NULL
      AND o.delivered_at<=now()-interval '48 hours'
      AND o.professional_proceeds_pence>0
      AND NOT EXISTS(
        SELECT 1
        FROM beauty.financial_ledger_transactions t
        WHERE t.event_reference='product-release:'||o.id::text
      )
    ORDER BY o.delivered_at,o.id
  LOOP
    PERFORM beauty.record_financial_ledger(
      'product-release:'||target_order.id::text,
      'release',
      'product_order',
      target_order.id,
      target_professional,
      jsonb_build_object(
        'releasePolicy','tracked_delivery_plus_48h',
        'deliveredAt',target_order.delivered_at
      ),
      jsonb_build_array(
        jsonb_build_object(
          'accountCode','professional_pending',
          'amountPence',target_order.professional_proceeds_pence
        ),
        jsonb_build_object(
          'accountCode','professional_available',
          'amountPence',-target_order.professional_proceeds_pence
        )
      )
    );
    released_count:=released_count+1;
  END LOOP;

  RETURN released_count;
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_financial_worker;
ALTER FUNCTION beauty.release_my_mature_product_proceeds() OWNER TO beauty_financial_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_financial_worker;
REVOKE ALL ON FUNCTION beauty.release_my_mature_product_proceeds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.release_my_mature_product_proceeds() TO beauty_app;

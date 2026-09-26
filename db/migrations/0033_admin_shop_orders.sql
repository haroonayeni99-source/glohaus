-- Read-only Shop order oversight for verified platform administrators.
-- No payment, refund, fulfilment or delivery mutation is added here.
GRANT SELECT ON beauty.product_orders,beauty.product_order_items
  TO beauty_admin_ops;

CREATE POLICY admin_shop_orders_read ON beauty.product_orders
FOR SELECT TO beauty_admin_ops USING(true);

CREATE POLICY admin_shop_order_items_read ON beauty.product_order_items
FOR SELECT TO beauty_admin_ops USING(true);

CREATE FUNCTION beauty.admin_shop_order_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $admin_orders$
BEGIN
  PERFORM beauty.require_admin();

  RETURN jsonb_build_object(
    'counts',
    (
      SELECT jsonb_build_object(
        'total',count(*)::integer,
        'paid',count(*) FILTER(WHERE status='paid')::integer,
        'processing',count(*) FILTER(WHERE status='processing')::integer,
        'shipped',count(*) FILTER(WHERE status='shipped')::integer,
        'delivered',count(*) FILTER(WHERE status='delivered')::integer,
        'refundPending',count(*) FILTER(WHERE status='refund_pending')::integer,
        'refunded',count(*) FILTER(WHERE status='refunded')::integer
      )
      FROM beauty.product_orders
    ),
    'orders',
    (
      SELECT coalesce(jsonb_agg(row_data),'[]'::jsonb)
      FROM (
        SELECT
          o.id,
          o.status,
          o.professional_name,
          o.recipient_name,
          o.city,
          o.postcode,
          o.country_code,
          o.subtotal_pence,
          o.delivery_pence,
          o.total_pence,
          o.tracking_carrier,
          o.tracking_number,
          o.created_at,
          coalesce(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'name',i.product_name,
                  'quantity',i.quantity,
                  'lineTotalPence',i.line_total_pence
                )
                ORDER BY i.id
              )
              FROM beauty.product_order_items i
              WHERE i.order_id=o.id
            ),
            '[]'::jsonb
          ) AS items
        FROM beauty.product_orders o
        ORDER BY o.created_at DESC,o.id DESC
        LIMIT 100
      ) row_data
    )
  );
END $admin_orders$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_shop_order_overview()
  OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;

REVOKE ALL ON FUNCTION beauty.admin_shop_order_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_shop_order_overview() TO beauty_app;

-- Give Admin/Owner early visibility of paid Shop orders that have waited
-- more than 24 hours without shipment.

CREATE OR REPLACE FUNCTION beauty.admin_shop_order_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
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
        'refunded',count(*) FILTER(WHERE status='refunded')::integer,
        'awaitingShipmentOver24h',
          count(*) FILTER(
            WHERE status IN('paid','processing')
              AND shipped_at IS NULL
              AND created_at<=now()-interval '24 hours'
          )::integer
      )
      FROM beauty.product_orders
    ),
    'orders',
    (
      SELECT coalesce(jsonb_agg(row_data),'[]'::jsonb)
      FROM (
        SELECT
          o.id,o.status,o.professional_name,o.recipient_name,o.city,o.postcode,
          o.country_code,o.subtotal_pence,o.delivery_pence,o.total_pence,
          o.tracking_carrier,o.tracking_number,o.created_at,
          (
            o.status IN('paid','processing')
            AND o.shipped_at IS NULL
            AND o.created_at<=now()-interval '24 hours'
          ) AS awaiting_shipment_over_24h,
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
        ORDER BY
          (
            o.status IN('paid','processing')
            AND o.shipped_at IS NULL
            AND o.created_at<=now()-interval '24 hours'
          ) DESC,
          o.created_at DESC,o.id DESC
        LIMIT 100
      ) row_data
    )
  );
END
$function$;

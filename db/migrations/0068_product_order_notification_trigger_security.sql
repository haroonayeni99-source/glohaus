-- Run product-order notification trigger with the restricted order-operator role.
-- The table uses FORCE RLS, so the operator also needs an explicit INSERT policy.

CREATE POLICY in_app_notification_order_ops_insert
ON beauty.in_app_notifications
FOR INSERT TO beauty_order_ops
WITH CHECK (true);

CREATE OR REPLACE FUNCTION beauty.record_product_order_activity_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE professional_user uuid;
BEGIN
  SELECT user_id INTO professional_user
  FROM beauty.professional_profiles
  WHERE id=NEW.professional_id;

  IF TG_OP='INSERT' AND NEW.status='paid' THEN
    INSERT INTO beauty.in_app_notifications(
      user_id,product_order_id,kind,title,body,href
    ) VALUES
      (
        NEW.customer_id,NEW.id,'order_paid','Order confirmed',
        'Your GLOHAUS Shop order has been paid and sent to the professional.',
        '/account/orders'
      ),
      (
        professional_user,NEW.id,'order_paid','New Shop order',
        'A customer has placed a paid product order.',
        '/professional/orders'
      )
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='processing' THEN
      INSERT INTO beauty.in_app_notifications(
        user_id,product_order_id,kind,title,body,href
      ) VALUES(
        NEW.customer_id,NEW.id,'order_processing','Order being prepared',
        'The professional is preparing your product order.',
        '/account/orders'
      ) ON CONFLICT DO NOTHING;
    ELSIF NEW.status='shipped' THEN
      INSERT INTO beauty.in_app_notifications(
        user_id,product_order_id,kind,title,body,href
      ) VALUES(
        NEW.customer_id,NEW.id,'order_shipped','Order shipped',
        'Your product order has been marked as shipped. Tracking is available in your order history.',
        '/account/orders'
      ) ON CONFLICT DO NOTHING;
    ELSIF NEW.status='delivered' THEN
      INSERT INTO beauty.in_app_notifications(
        user_id,product_order_id,kind,title,body,href
      ) VALUES
        (
          NEW.customer_id,NEW.id,'order_delivered','Delivery confirmed',
          'Your product order is marked as delivered.',
          '/account/orders'
        ),
        (
          professional_user,NEW.id,'order_delivered','Customer confirmed delivery',
          'The customer confirmed delivery. Protected proceeds follow the GLOHAUS release window.',
          '/professional/orders'
        )
      ON CONFLICT DO NOTHING;
    ELSIF NEW.status='refund_pending' THEN
      INSERT INTO beauty.in_app_notifications(
        user_id,product_order_id,kind,title,body,href
      ) VALUES(
        NEW.customer_id,NEW.id,'order_refund_pending','Product refund started',
        'A full refund has been started for this product order.',
        '/account/orders'
      ) ON CONFLICT DO NOTHING;
    ELSIF NEW.status='refunded' THEN
      INSERT INTO beauty.in_app_notifications(
        user_id,product_order_id,kind,title,body,href
      ) VALUES
        (
          NEW.customer_id,NEW.id,'order_refunded','Product refund confirmed',
          'The payment provider confirmed your product-order refund.',
          '/account/orders'
        ),
        (
          professional_user,NEW.id,'order_refunded','Product order refunded',
          'The customer refund has been confirmed. Any professional balance recovery is handled separately.',
          '/professional/orders'
        )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_order_ops;
ALTER FUNCTION beauty.record_product_order_activity_notification()
  OWNER TO beauty_order_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_order_ops;
REVOKE ALL ON FUNCTION beauty.record_product_order_activity_notification()
  FROM PUBLIC;

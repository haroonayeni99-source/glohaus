-- Product-order notifications for the web and mobile-browser inbox.
-- Website release.

ALTER TABLE beauty.in_app_notifications
  ADD COLUMN product_order_id uuid REFERENCES beauty.product_orders(id);

ALTER TABLE beauty.in_app_notifications
  DROP CONSTRAINT in_app_notifications_kind_check;

ALTER TABLE beauty.in_app_notifications
  ADD CONSTRAINT in_app_notifications_kind_check CHECK(kind IN (
    'booking_created','booking_confirmed','booking_cancelled','appointment_completed',
    'order_paid','order_processing','order_shipped','order_delivered',
    'order_refund_pending','order_refunded'
  ));

CREATE UNIQUE INDEX in_app_notification_product_order_unique
  ON beauty.in_app_notifications(product_order_id,user_id,kind)
  WHERE product_order_id IS NOT NULL;

GRANT INSERT(product_order_id,user_id,kind,title,body,href)
  ON beauty.in_app_notifications TO beauty_order_ops,beauty_payment_worker;

CREATE FUNCTION beauty.record_product_order_activity_notification()
RETURNS trigger
LANGUAGE plpgsql
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

CREATE TRIGGER product_order_activity_notifications
AFTER INSERT OR UPDATE OF status ON beauty.product_orders
FOR EACH ROW EXECUTE FUNCTION beauty.record_product_order_activity_notification();

REVOKE ALL ON FUNCTION beauty.record_product_order_activity_notification()
FROM PUBLIC;

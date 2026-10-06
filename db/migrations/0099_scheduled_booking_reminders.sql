-- Add in-app booking reminders to the hourly maintenance worker so reminders
-- still work even when transactional email credentials are not configured.

ALTER TABLE beauty.in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_kind_check;

ALTER TABLE beauty.in_app_notifications
  ADD CONSTRAINT in_app_notifications_kind_check CHECK(kind IN (
    'booking_created','booking_confirmed','booking_cancelled','appointment_completed',
    'booking_reminder',
    'order_paid','order_processing','order_shipped','order_delivered',
    'order_refund_pending','order_refunded','order_shipping_reminder'
  ));

CREATE OR REPLACE FUNCTION beauty.run_scheduled_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  expired_bookings integer := 0;
  expired_shop_checkouts integer := 0;
  released_bookings integer := 0;
  released_products integer := 0;
  shipping_reminders integer := 0;
  booking_reminders integer := 0;
  target_checkout record;
  target_booking record;
  target_order record;
BEGIN
  WITH expired AS (
    UPDATE beauty.bookings b
    SET status='expired',
        hold_expires_at=LEAST(coalesce(b.hold_expires_at,now()),now())
    WHERE b.status='payment_pending'
      AND b.hold_expires_at IS NOT NULL
      AND b.hold_expires_at<=now()
      AND EXISTS(
        SELECT 1 FROM beauty.payments p
        WHERE p.booking_id=b.id AND p.captured_pence=0
      )
    RETURNING b.id
  )
  SELECT count(*) INTO expired_bookings FROM expired;

  FOR target_checkout IN
    SELECT id,stripe_session_id
    FROM beauty.shop_checkouts
    WHERE status='reserved' AND expires_at<=now()
    ORDER BY expires_at,id
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM beauty.release_shop_checkout(
      target_checkout.id,target_checkout.stripe_session_id,'expired'
    );
    expired_shop_checkouts:=expired_shop_checkouts+1;
  END LOOP;

  FOR target_booking IN
    SELECT b.id,b.professional_id,q.professional_proceeds_pence,b.completed_at
    FROM beauty.bookings b
    JOIN beauty.payments p ON p.booking_id=b.id
    JOIN beauty.financial_quotes q ON q.booking_id=b.id
    WHERE b.status='completed'
      AND b.completed_at IS NOT NULL
      AND b.completed_at<=now()-interval '24 hours'
      AND p.status='paid'
      AND p.refunded_pence=0
      AND q.professional_proceeds_pence>0
      AND EXISTS(
        SELECT 1 FROM beauty.financial_ledger_transactions t
        WHERE t.event_reference='booking-payment:'||b.id::text
      )
      AND NOT EXISTS(
        SELECT 1 FROM beauty.financial_ledger_transactions t
        WHERE t.event_reference='booking-release:'||b.id::text
      )
      AND NOT EXISTS(
        SELECT 1 FROM beauty.booking_disputes d
        WHERE d.booking_id=b.id
          AND d.status IN(
            'warning_needs_response','warning_under_review',
            'needs_response','under_review','lost'
          )
      )
    ORDER BY b.completed_at,b.id
    FOR UPDATE OF b SKIP LOCKED
  LOOP
    PERFORM beauty.record_financial_ledger(
      'booking-release:'||target_booking.id::text,
      'release','booking',target_booking.id,target_booking.professional_id,
      jsonb_build_object(
        'releasePolicy','completed_plus_24h',
        'completedAt',target_booking.completed_at,
        'automation','scheduled_maintenance'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'accountCode','professional_pending',
          'amountPence',target_booking.professional_proceeds_pence
        ),
        jsonb_build_object(
          'accountCode','professional_available',
          'amountPence',-target_booking.professional_proceeds_pence
        )
      )
    );
    released_bookings:=released_bookings+1;
  END LOOP;

  FOR target_order IN
    SELECT o.id,o.professional_id,o.professional_proceeds_pence,o.delivered_at
    FROM beauty.product_orders o
    WHERE o.status='delivered'
      AND o.delivered_at IS NOT NULL
      AND o.delivered_at<=now()-interval '48 hours'
      AND o.professional_proceeds_pence>0
      AND NOT EXISTS(
        SELECT 1 FROM beauty.financial_ledger_transactions t
        WHERE t.event_reference='product-release:'||o.id::text
      )
    ORDER BY o.delivered_at,o.id
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    PERFORM beauty.record_financial_ledger(
      'product-release:'||target_order.id::text,
      'release','product_order',target_order.id,target_order.professional_id,
      jsonb_build_object(
        'releasePolicy','tracked_delivery_plus_48h',
        'deliveredAt',target_order.delivered_at,
        'automation','scheduled_maintenance'
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
    released_products:=released_products+1;
  END LOOP;

  WITH inserted AS (
    INSERT INTO beauty.in_app_notifications(
      user_id,booking_id,kind,title,body,href
    )
    SELECT
      b.customer_id,b.id,'booking_reminder',
      'Appointment tomorrow',
      'Your GLOHAUS appointment is coming up within 24 hours.',
      '/account/bookings/'||b.id::text
    FROM beauty.bookings b
    WHERE b.status='confirmed'
      AND b.starts_at>now()+interval '23 hours'
      AND b.starts_at<=now()+interval '24 hours'
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO booking_reminders FROM inserted;

  WITH inserted AS (
    INSERT INTO beauty.in_app_notifications(
      user_id,product_order_id,kind,title,body,href
    )
    SELECT
      p.user_id,o.id,'order_shipping_reminder',
      'Shop order awaiting shipment',
      'A paid GLOHAUS Shop order is still waiting to be shipped. Add tracking when you dispatch it.',
      '/professional/orders'
    FROM beauty.product_orders o
    JOIN beauty.professional_profiles p ON p.id=o.professional_id
    WHERE o.status IN('paid','processing')
      AND o.created_at<=now()-interval '24 hours'
      AND o.shipped_at IS NULL
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO shipping_reminders FROM inserted;

  RETURN jsonb_build_object(
    'expiredBookings',expired_bookings,
    'expiredShopCheckouts',expired_shop_checkouts,
    'releasedBookings',released_bookings,
    'releasedProducts',released_products,
    'bookingReminders',booking_reminders,
    'shippingReminders',shipping_reminders
  );
END;
$$;

ALTER FUNCTION beauty.run_scheduled_maintenance() OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.run_scheduled_maintenance()
  FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.run_scheduled_maintenance()
  TO beauty_payment_worker;

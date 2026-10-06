-- Close stale booking and Shop email jobs so queue health remains truthful.

CREATE OR REPLACE FUNCTION beauty.run_scheduled_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  expired_bookings integer := 0;
  expired_shop_checkouts integer := 0;
  released_bookings integer := 0;
  released_products integer := 0;
  shipping_reminders integer := 0;
  booking_reminders integer := 0;
  stale_claims integer := 0;
  pruned_job_runs integer := 0;
  terminal_notifications integer := 0;
  terminal_product_notifications integer := 0;
  target_checkout record;
  target_booking record;
  target_order record;
BEGIN
  WITH cleared AS (
    UPDATE beauty.notification_outbox
    SET claimed_until=NULL
    WHERE sent_at IS NULL
      AND claimed_until IS NOT NULL
      AND claimed_until<now()
    RETURNING 1
  )
  SELECT count(*) INTO stale_claims FROM cleared;

  WITH cleared AS (
    UPDATE beauty.product_notification_outbox
    SET claimed_until=NULL
    WHERE sent_at IS NULL
      AND claimed_until IS NOT NULL
      AND claimed_until<now()
    RETURNING 1
  )
  SELECT stale_claims + count(*) INTO stale_claims FROM cleared;

  WITH cleared AS (
    UPDATE beauty.marketing_outbox
    SET claimed_until=NULL
    WHERE sent_at IS NULL
      AND claimed_until IS NOT NULL
      AND claimed_until<now()
    RETURNING 1
  )
  SELECT stale_claims + count(*) INTO stale_claims FROM cleared;

  WITH terminal AS (
    UPDATE beauty.notification_outbox n
    SET attempts=GREATEST(n.attempts,5),
        claimed_until=NULL,
        delivery_status=CASE
          WHEN EXISTS(
            SELECT 1 FROM beauty.users u
            JOIN beauty.email_suppressions s ON s.email=lower(u.email)
            WHERE u.id=n.recipient_user_id
          ) THEN 'suppressed'
          ELSE 'failed'
        END,
        last_error=CASE
          WHEN EXISTS(
            SELECT 1 FROM beauty.users u
            JOIN beauty.email_suppressions s ON s.email=lower(u.email)
            WHERE u.id=n.recipient_user_id
          ) THEN 'SUPPRESSED'
          WHEN n.first_attempt_at IS NOT NULL
            AND n.first_attempt_at<=now()-interval '23 hours'
            THEN 'RETRY_WINDOW_EXPIRED'
          ELSE 'NO_LONGER_APPLICABLE'
        END
    FROM beauty.bookings b
    WHERE n.booking_id=b.id
      AND n.sent_at IS NULL
      AND n.attempts<5
      AND (
        (n.first_attempt_at IS NOT NULL AND n.first_attempt_at<=now()-interval '23 hours')
        OR EXISTS(
          SELECT 1 FROM beauty.users u
          JOIN beauty.email_suppressions s ON s.email=lower(u.email)
          WHERE u.id=n.recipient_user_id
        )
        OR NOT (
          (n.kind='confirmation' AND b.status IN('confirmed','completed'))
          OR (n.kind='cancellation' AND b.status='cancelled')
          OR (n.kind='reminder' AND b.status='confirmed' AND b.starts_at>now())
          OR (n.kind='review_request' AND b.status='completed')
        )
      )
    RETURNING 1
  )
  SELECT count(*) INTO terminal_notifications FROM terminal;

  WITH terminal AS (
    UPDATE beauty.product_notification_outbox n
    SET attempts=GREATEST(n.attempts,5),
        claimed_until=NULL,
        delivery_status=CASE
          WHEN EXISTS(
            SELECT 1 FROM beauty.users u
            JOIN beauty.email_suppressions s ON s.email=lower(u.email)
            WHERE u.id=n.recipient_user_id
          ) THEN 'suppressed'
          ELSE 'failed'
        END,
        last_error=CASE
          WHEN EXISTS(
            SELECT 1 FROM beauty.users u
            JOIN beauty.email_suppressions s ON s.email=lower(u.email)
            WHERE u.id=n.recipient_user_id
          ) THEN 'SUPPRESSED'
          WHEN n.first_attempt_at IS NOT NULL
            AND n.first_attempt_at<=now()-interval '23 hours'
            THEN 'RETRY_WINDOW_EXPIRED'
          ELSE 'NO_LONGER_APPLICABLE'
        END
    FROM beauty.product_orders o
    WHERE n.product_order_id=o.id
      AND n.sent_at IS NULL
      AND n.attempts<5
      AND (
        (n.first_attempt_at IS NOT NULL AND n.first_attempt_at<=now()-interval '23 hours')
        OR EXISTS(
          SELECT 1 FROM beauty.users u
          JOIN beauty.email_suppressions s ON s.email=lower(u.email)
          WHERE u.id=n.recipient_user_id
        )
        OR NOT (
          (n.kind IN('order_paid_customer','order_paid_professional') AND o.status IN('paid','processing','shipped','delivered'))
          OR (n.kind='order_shipped_customer' AND o.status IN('shipped','delivered'))
          OR (n.kind='order_delivered_professional' AND o.status='delivered')
          OR (n.kind='order_refunded_customer' AND o.status='refunded')
        )
      )
    RETURNING 1
  )
  SELECT count(*) INTO terminal_product_notifications FROM terminal;

  WITH pruned AS (
    DELETE FROM beauty.backend_job_runs
    WHERE created_at < now()-interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO pruned_job_runs FROM pruned;

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
    'staleClaimsCleared',stale_claims,
    'terminalNotifications',terminal_notifications,
    'terminalProductNotifications',terminal_product_notifications,
    'jobRunsPruned',pruned_job_runs,
    'expiredBookings',expired_bookings,
    'expiredShopCheckouts',expired_shop_checkouts,
    'releasedBookings',released_bookings,
    'releasedProducts',released_products,
    'bookingReminders',booking_reminders,
    'shippingReminders',shipping_reminders
  );
END;
$function$
;

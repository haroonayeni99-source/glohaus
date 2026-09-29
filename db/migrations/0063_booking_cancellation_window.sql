-- Prevent customers or professionals from cancelling a confirmed booking after the appointment has started.
-- After the appointment ends, the professional should use completed/no_show instead.

CREATE OR REPLACE FUNCTION beauty.change_booking(target uuid, next_status text, reason text DEFAULT ''::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  booking beauty.bookings;
  actor beauty.users;
  is_pro boolean;
BEGIN
  SELECT * INTO actor
  FROM beauty.users
  WHERE auth_id=beauty.auth_id() AND status='active';

  SELECT * INTO booking
  FROM beauty.bookings
  WHERE id=target
  FOR UPDATE;

  is_pro:=EXISTS(
    SELECT 1
    FROM beauty.professional_profiles
    WHERE id=booking.professional_id AND user_id=actor.id
  );

  IF actor.id IS NULL OR booking.id IS NULL OR (actor.id<>booking.customer_id AND NOT is_pro) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF next_status='cancelled'
     AND booking.status IN ('payment_pending','confirmed')
     AND booking.starts_at > now()
     AND length(trim(reason)) BETWEEN 5 AND 500 THEN
    UPDATE beauty.bookings
    SET status='cancelled',
        cancelled_at=now(),
        cancellation_actor=CASE WHEN is_pro THEN 'professional' ELSE 'customer' END,
        cancellation_reason=trim(reason)
    WHERE id=target;

    UPDATE beauty.payments
    SET status='refund_required'
    WHERE booking_id=target AND captured_pence>refunded_pence;

    PERFORM beauty.enqueue_booking_notifications(target,'cancellation');

  ELSIF is_pro
        AND next_status IN ('completed','no_show')
        AND booking.status='confirmed'
        AND booking.ends_at<=now() THEN
    UPDATE beauty.bookings
    SET status=next_status,
        completed_at=CASE WHEN next_status='completed' THEN now() ELSE NULL END
    WHERE id=target;

    IF next_status='completed' THEN
      INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id,due_at)
      VALUES(target,'review_request',booking.customer_id,now()+interval '1 hour')
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023';
  END IF;
END
$function$;

-- Release a customer's unpaid booking hold when hosted Checkout setup fails.
-- This prevents a failed provider call from blocking the slot for the full hold window.

CREATE FUNCTION beauty.release_failed_booking_checkout(target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  released boolean:=false;
BEGIN
  UPDATE beauty.bookings b
  SET status='expired',
      hold_expires_at=LEAST(coalesce(b.hold_expires_at,now()),now())
  WHERE b.id=target
    AND b.status='payment_pending'
    AND EXISTS(
      SELECT 1
      FROM beauty.users u
      WHERE u.id=b.customer_id
        AND u.auth_id=beauty.auth_id()
        AND u.status='active'
    )
    AND EXISTS(
      SELECT 1
      FROM beauty.payments p
      WHERE p.booking_id=b.id
        AND p.captured_pence=0
    );

  released:=FOUND;
  RETURN released;
END;
$fn$;

GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.release_failed_booking_checkout(uuid) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.release_failed_booking_checkout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.release_failed_booking_checkout(uuid) TO beauty_app;

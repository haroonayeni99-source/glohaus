-- Keep the payment worker least-privileged while allowing dispute sync.
-- sync_booking_dispute only reads the booking row; it does not need to lock
-- that row for update. Removing FOR UPDATE avoids requiring UPDATE privilege
-- on beauty.bookings for beauty_payment_worker.

DO $migration$
DECLARE
  fn text;
  updated_fn text;
  old_block text := $old$
  SELECT b.* INTO booking
  FROM beauty.bookings b
  WHERE b.id=payment.booking_id
  FOR UPDATE;
$old$;
  new_block text := $new$
  SELECT b.* INTO booking
  FROM beauty.bookings b
  WHERE b.id=payment.booking_id;
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='beauty'
    AND p.proname='sync_booking_dispute'
  LIMIT 1;

  IF fn IS NULL THEN
    RAISE EXCEPTION 'sync_booking_dispute not found';
  END IF;

  updated_fn := replace(fn, old_block, new_block);

  IF updated_fn = fn THEN
    RAISE EXCEPTION 'expected booking lock block was not found';
  END IF;

  EXECUTE updated_fn;
END;
$migration$;

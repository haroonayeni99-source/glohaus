-- Keep external refunds within existing worker privileges. The payment-row
-- lock serialises refunds; the booking is read only for its professional ID.
-- Qualify the status parameter so pending -> succeeded updates are unambiguous.
DO $migration$
DECLARE
  fn text;
  updated_fn text;
  old_lock text := $old$
  SELECT b.* INTO booking
  FROM beauty.bookings b
  WHERE b.id=payment.booking_id
  FOR UPDATE;
$old$;
  new_lock text := $new$
  SELECT b.* INTO booking
  FROM beauty.bookings b
  WHERE b.id=payment.booking_id;
$new$;
BEGIN
  SELECT pg_get_functiondef('beauty.reconcile_external_booking_refund(text,text,integer,text,text)'::regprocedure)
  INTO fn;
  IF position(old_lock IN fn)=0
     OR position('SET provider_status=provider_status,updated_at=now()' IN fn)=0 THEN
    RAISE EXCEPTION 'Unexpected external refund reconciliation definition; review before applying';
  END IF;
  updated_fn := replace(fn,old_lock,new_lock);
  updated_fn := replace(updated_fn,
    'SET provider_status=provider_status,updated_at=now()',
    'SET provider_status=reconcile_external_booking_refund.provider_status,updated_at=now()');
  EXECUTE updated_fn;
END;
$migration$;

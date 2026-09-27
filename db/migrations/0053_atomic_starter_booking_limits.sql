-- Enforce Starter booking limits atomically at the database boundary.
-- Active payment holds count toward the five Starter bookings; expired holds do not.

CREATE OR REPLACE FUNCTION beauty.professional_access_state(target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  verification text;
  standing text;
  payment_ready boolean;
  payment_exists boolean;
  effective text;
  starter_used integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=target) THEN
    RETURN jsonb_build_object(
      'status','restricted',
      'verified',false,
      'paymentReady',false,
      'starterBookingsUsed',0,
      'starterBookingsRemaining',0
    );
  END IF;

  SELECT
    coalesce(t.verification_status,'unverified'),
    coalesce(t.standing_status,'good'),
    coalesce(pa.charges_enabled,false),
    pa.professional_id IS NOT NULL
  INTO verification,standing,payment_ready,payment_exists
  FROM beauty.professional_profiles p
  LEFT JOIN beauty.professional_trust_status t ON t.professional_id=p.id
  LEFT JOIN beauty.professional_payment_accounts pa ON pa.professional_id=p.id
  WHERE p.id=target;

  SELECT count(*)::integer INTO starter_used
  FROM beauty.bookings
  WHERE professional_id=target
    AND (
      status IN('confirmed','completed','no_show')
      OR (status='payment_pending' AND hold_expires_at>now())
    );

  effective :=
    CASE
      WHEN standing='restricted' OR verification='rejected' THEN 'restricted'
      WHEN verification='verified' THEN 'verified'
      WHEN verification='pending' OR payment_exists THEN 'pending'
      ELSE 'unverified'
    END;

  RETURN jsonb_build_object(
    'status',effective,
    'verified',effective='verified',
    'paymentReady',payment_ready,
    'starterBookingsUsed',starter_used,
    'starterBookingsRemaining',
      CASE WHEN effective='verified' THEN NULL ELSE greatest(0,5-starter_used) END
  );
END $$;

CREATE OR REPLACE FUNCTION beauty.enforce_starter_booking_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  access jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.professional_id::text,0));

  UPDATE beauty.bookings
  SET status='expired'
  WHERE professional_id=NEW.professional_id
    AND status='payment_pending'
    AND hold_expires_at<=now();

  SELECT beauty.professional_access_state(NEW.professional_id) INTO access;

  IF coalesce(access->>'status','restricted')='restricted' THEN
    RAISE EXCEPTION 'PROFESSIONAL_RESTRICTED' USING ERRCODE='42501';
  END IF;

  IF coalesce((access->>'verified')::boolean,false)=false AND (
    NEW.price_pence>20000
    OR NEW.deposit_pence>0
    OR coalesce((access->>'starterBookingsRemaining')::integer,0)<=0
  ) THEN
    RAISE EXCEPTION 'VERIFICATION_REQUIRED' USING ERRCODE='42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_starter_booking_insert
ON beauty.bookings;

CREATE TRIGGER enforce_starter_booking_insert
BEFORE INSERT ON beauty.bookings
FOR EACH ROW
EXECUTE FUNCTION beauty.enforce_starter_booking_insert();

REVOKE ALL ON FUNCTION beauty.enforce_starter_booking_insert() FROM PUBLIC;

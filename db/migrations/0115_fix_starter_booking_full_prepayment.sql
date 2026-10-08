-- Keep starter full-prepayment bookings compatible with verified deposit rules.
-- Starter/unverified professionals may accept up to five bookings without a
-- professional-required deposit. GLOHAUS collects the full service amount
-- through Checkout so commission is protected. The 15%-40% deposit rules
-- remain exclusive to verified professionals.

GRANT EXECUTE ON FUNCTION beauty.professional_service_commission_basis_points(uuid)
TO beauty_booking_ops;

CREATE OR REPLACE FUNCTION beauty.enforce_required_deposit_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  is_verified boolean:=false;
BEGIN
  IF NEW.price_pence IS NULL OR NEW.price_pence<=0 THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(
    (beauty.professional_access_state(NEW.professional_id)->>'verified')::boolean,
    false
  )
  INTO is_verified;

  IF is_verified
    AND NEW.deposit_pence*100>NEW.price_pence*40 THEN
    RAISE EXCEPTION 'MAXIMUM_DEPOSIT_EXCEEDED' USING ERRCODE='22023';
  END IF;

  IF is_verified
    AND NEW.deposit_pence*100<NEW.price_pence*15 THEN
    RAISE EXCEPTION 'MINIMUM_DEPOSIT_REQUIRED' USING ERRCODE='22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION beauty.enforce_starter_booking_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  access jsonb;
  service_required_deposit integer:=0;
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

  IF coalesce((access->>'verified')::boolean,false)=false THEN
    SELECT s.deposit_pence
    INTO service_required_deposit
    FROM beauty.services s
    WHERE s.id=NEW.service_id
      AND s.professional_id=NEW.professional_id;

    IF NEW.price_pence>20000
      OR coalesce(service_required_deposit,0)>0
      OR coalesce((access->>'starterBookingsRemaining')::integer,0)<=0 THEN
      RAISE EXCEPTION 'VERIFICATION_REQUIRED' USING ERRCODE='42501';
    END IF;

    IF NEW.deposit_pence IS DISTINCT FROM NEW.price_pence THEN
      RAISE EXCEPTION 'STARTER_FULL_PREPAYMENT_REQUIRED' USING ERRCODE='22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION beauty.enforce_verified_service_deposit_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  verified boolean:=false;
  service_price integer;
  service_deposit integer;
BEGIN
  SELECT coalesce(
    (beauty.professional_access_state(NEW.professional_id)->>'verified')::boolean,
    false
  )
  INTO verified;

  SELECT s.price_pence,s.deposit_pence
  INTO service_price,service_deposit
  FROM beauty.services s
  WHERE s.id=NEW.service_id
    AND s.professional_id=NEW.professional_id;

  IF verified THEN
    IF service_price IS NULL OR service_price<=0 THEN
      RAISE EXCEPTION 'INVALID_SERVICE_PRICE' USING ERRCODE='22023';
    END IF;

    IF service_deposit<ceil(service_price*0.15)
      OR service_deposit>floor(service_price*0.40) THEN
      RAISE EXCEPTION 'DEPOSIT_RANGE' USING ERRCODE='22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

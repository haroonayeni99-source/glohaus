-- GLOHAUS policy: a professional-required deposit can never be more than
-- 40% of the service price. The constraint is NOT VALID so historical records
-- remain intact, while every newly written or edited service is protected.
ALTER TABLE beauty.services
  ADD CONSTRAINT service_required_deposit_maximum
  CHECK (deposit_pence * 100 <= price_pence * 40) NOT VALID;

-- A booking is an immutable service-price snapshot. Enforce the same rule at
-- the booking boundary so stale data, direct API manipulation or a future
-- service migration cannot create an excessive charge.
CREATE FUNCTION beauty.enforce_required_deposit_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.deposit_pence * 100 > NEW.price_pence * 40 THEN
    RAISE EXCEPTION 'MAXIMUM_DEPOSIT_EXCEEDED' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_required_deposit_cap
  BEFORE INSERT OR UPDATE OF price_pence, deposit_pence ON beauty.bookings
  FOR EACH ROW EXECUTE FUNCTION beauty.enforce_required_deposit_cap();

ALTER FUNCTION beauty.enforce_required_deposit_cap() OWNER TO beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.enforce_required_deposit_cap() FROM PUBLIC;

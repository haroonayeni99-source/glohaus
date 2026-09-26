-- Tighten connected-account access and gate Shop checkout on payout readiness.
-- The legacy charges_enabled column is retained for compatibility, but now
-- represents marketplace transfer/payout readiness rather than direct charges.

DROP POLICY IF EXISTS connect_owner ON beauty.professional_payment_accounts;
DROP POLICY IF EXISTS connect_owner_create ON beauty.professional_payment_accounts;

CREATE POLICY connect_owner ON beauty.professional_payment_accounts
FOR SELECT TO beauty_app
USING (
  EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

CREATE POLICY connect_owner_create ON beauty.professional_payment_accounts
FOR INSERT TO beauty_app
WITH CHECK (
  NOT charges_enabled
  AND EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

GRANT SELECT ON beauty.professional_payment_accounts TO beauty_payment_worker;

CREATE POLICY connect_payment_worker ON beauty.professional_payment_accounts
FOR SELECT TO beauty_payment_worker USING(true);

CREATE FUNCTION beauty.shop_cart_payouts_ready() RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE actor uuid;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  IF actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  RETURN NOT EXISTS(
    SELECT 1
    FROM beauty.cart_items ci
    JOIN beauty.products p ON p.id=ci.product_id
    LEFT JOIN beauty.professional_payment_accounts pa
      ON pa.professional_id=p.professional_id
    WHERE ci.customer_id=actor
      AND coalesce(pa.charges_enabled,false)=false
  );
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_payment_worker;
ALTER FUNCTION beauty.shop_cart_payouts_ready() OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_payment_worker;

REVOKE ALL ON FUNCTION beauty.shop_cart_payouts_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.shop_cart_payouts_ready() TO beauty_app;

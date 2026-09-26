-- GLOHAUS pricing model and visibility controls.
-- Customer-facing: mandatory £1 booking fee.
-- Professional-facing plans: Starter 8%, Pro 6%, Premium 4%.
-- Product commission: 10%. Standard withdrawal: free. Instant withdrawal: 4%.

CREATE TABLE beauty.professional_plan_definitions (
  plan_key text PRIMARY KEY CHECK(plan_key IN('starter','pro','premium')),
  display_name text NOT NULL UNIQUE,
  monthly_price_pence integer NOT NULL CHECK(monthly_price_pence>=0),
  service_commission_basis_points integer NOT NULL CHECK(service_commission_basis_points BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO beauty.professional_plan_definitions(
  plan_key,display_name,monthly_price_pence,service_commission_basis_points
) VALUES
  ('starter','Starter',0,800),
  ('pro','Pro',1999,600),
  ('premium','Premium',3999,400)
ON CONFLICT(plan_key) DO UPDATE SET
  display_name=excluded.display_name,
  monthly_price_pence=excluded.monthly_price_pence,
  service_commission_basis_points=excluded.service_commission_basis_points,
  active=true;

CREATE TABLE beauty.professional_subscriptions (
  professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
  plan_key text NOT NULL DEFAULT 'starter' REFERENCES beauty.professional_plan_definitions(plan_key),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','past_due','cancelled')),
  provider_subscription_id text UNIQUE,
  current_period_end timestamptz,
  accepted_terms_version text,
  accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beauty.professional_plan_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_plan_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY professional_plan_catalogue_read
ON beauty.professional_plan_definitions
FOR SELECT TO beauty_app USING(active);

CREATE POLICY professional_subscription_owner_read
ON beauty.professional_subscriptions
FOR SELECT TO beauty_app
USING(
  EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

GRANT SELECT ON beauty.professional_plan_definitions,beauty.professional_subscriptions TO beauty_app;
GRANT SELECT ON beauty.professional_plan_definitions,beauty.professional_subscriptions TO beauty_financial_worker,beauty_payment_worker;
CREATE POLICY professional_plans_finance_read ON beauty.professional_plan_definitions
FOR SELECT TO beauty_financial_worker USING(true);
CREATE POLICY professional_subscriptions_finance_read ON beauty.professional_subscriptions
FOR SELECT TO beauty_financial_worker USING(true);
CREATE POLICY professional_plans_payment_read ON beauty.professional_plan_definitions
FOR SELECT TO beauty_payment_worker USING(true);
CREATE POLICY professional_subscriptions_payment_read ON beauty.professional_subscriptions
FOR SELECT TO beauty_payment_worker USING(true);

CREATE FUNCTION beauty.public_booking_fee_pence() RETURNS integer
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$ SELECT 100 $$;

CREATE FUNCTION beauty.my_professional_pricing() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE target uuid; selected beauty.professional_plan_definitions;
BEGIN
  SELECT p.id INTO target
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  IF target IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT d.* INTO selected
  FROM beauty.professional_plan_definitions d
  LEFT JOIN beauty.professional_subscriptions s
    ON s.professional_id=target
   AND s.status='active'
   AND s.plan_key=d.plan_key
  WHERE d.plan_key=coalesce(
    (SELECT plan_key FROM beauty.professional_subscriptions
      WHERE professional_id=target AND status='active'),
    'starter'
  )
  LIMIT 1;

  RETURN jsonb_build_object(
    'planKey',selected.plan_key,
    'planName',selected.display_name,
    'monthlyPricePence',selected.monthly_price_pence,
    'serviceCommissionBasisPoints',selected.service_commission_basis_points,
    'productCommissionBasisPoints',1000,
    'standardWithdrawalBasisPoints',0,
    'instantWithdrawalBasisPoints',400,
    'customerBookingFeePence',100
  );
END $$;

CREATE FUNCTION beauty.professional_service_commission_basis_points(target uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT coalesce((
    SELECT d.service_commission_basis_points
    FROM beauty.professional_subscriptions s
    JOIN beauty.professional_plan_definitions d ON d.plan_key=s.plan_key
    WHERE s.professional_id=target
      AND s.status='active'
      AND d.active
    LIMIT 1
  ),800)
$$;

GRANT CREATE ON SCHEMA beauty TO beauty_financial_worker;
ALTER FUNCTION beauty.my_professional_pricing() OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.professional_service_commission_basis_points(uuid) OWNER TO beauty_financial_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_financial_worker;

REVOKE ALL ON FUNCTION beauty.my_professional_pricing(),beauty.professional_service_commission_basis_points(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.my_professional_pricing() TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.professional_service_commission_basis_points(uuid) TO beauty_financial_worker,beauty_payment_worker;

-- Freeze the current product and withdrawal percentages as active rules when an owner exists.
DO $$
DECLARE owner_id uuid;
BEGIN
  SELECT u.id INTO owner_id
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id
  WHERE r.role='owner' AND u.status='active'
  LIMIT 1;

  IF owner_id IS NOT NULL THEN
    UPDATE beauty.financial_fee_rules
      SET active=false,effective_until=now()
      WHERE active AND (
        (transaction_kind='product' AND category_key IS NULL AND fee_payer='professional')
        OR (transaction_kind='withdrawal' AND category_key IN('standard','instant') AND fee_payer='professional')
      );

    INSERT INTO beauty.financial_fee_rules(
      transaction_kind,category_key,fee_payer,percentage_basis_points,
      fixed_fee_pence,minimum_fee_pence,maximum_fee_pence,
      minimum_transaction_pence,processing_cost_payer,created_by_user_id
    ) VALUES
      ('product',NULL,'professional',1000,0,0,NULL,1,'platform',owner_id),
      ('withdrawal','standard','professional',0,0,0,NULL,1,'platform',owner_id),
      ('withdrawal','instant','professional',400,0,0,NULL,1,'platform',owner_id);
  END IF;
END $$;

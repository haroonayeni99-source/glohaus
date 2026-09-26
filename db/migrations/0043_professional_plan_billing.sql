-- Stripe-backed professional subscription state.
-- Paid plan commission only activates after a verified Stripe webhook.

ALTER TABLE beauty.professional_subscriptions
  ADD COLUMN provider_customer_id text UNIQUE,
  ADD COLUMN provider_price_id text,
  ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;

GRANT INSERT,UPDATE ON beauty.professional_subscriptions TO beauty_payment_worker;

DROP POLICY IF EXISTS professional_subscriptions_payment_read
  ON beauty.professional_subscriptions;
CREATE POLICY professional_subscriptions_payment_worker
ON beauty.professional_subscriptions
FOR ALL TO beauty_payment_worker
USING(true) WITH CHECK(true);

CREATE OR REPLACE FUNCTION beauty.apply_professional_subscription(
  target_professional uuid,
  next_plan text,
  customer_ref text,
  subscription_ref text,
  price_ref text,
  next_status text,
  next_period_end timestamptz,
  next_cancel_at_period_end boolean,
  pricing_ack_version text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE existing beauty.professional_subscriptions;
BEGIN
  IF next_plan NOT IN ('pro','premium')
    OR next_status NOT IN ('active','past_due','cancelled')
    OR length(trim(coalesce(customer_ref,'')))<3
    OR length(trim(coalesce(subscription_ref,'')))<3
    OR length(trim(coalesce(price_ref,'')))<3
    OR length(trim(coalesce(pricing_ack_version,''))) NOT BETWEEN 3 AND 80
    OR NOT EXISTS(
      SELECT 1 FROM beauty.professional_profiles WHERE id=target_professional
    ) THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT * INTO existing
  FROM beauty.professional_subscriptions
  WHERE professional_id=target_professional
  FOR UPDATE;

  IF existing.provider_subscription_id IS NOT NULL
    AND existing.provider_subscription_id<>trim(subscription_ref)
    AND existing.status='active' THEN
    RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_EXISTS' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.professional_subscriptions(
    professional_id,plan_key,status,provider_customer_id,
    provider_subscription_id,provider_price_id,current_period_end,
    cancel_at_period_end,accepted_terms_version,accepted_at,updated_at
  ) VALUES(
    target_professional,next_plan,next_status,trim(customer_ref),
    trim(subscription_ref),trim(price_ref),next_period_end,
    coalesce(next_cancel_at_period_end,false),trim(pricing_ack_version),
    now(),now()
  )
  ON CONFLICT(professional_id) DO UPDATE SET
    plan_key=excluded.plan_key,
    status=excluded.status,
    provider_customer_id=excluded.provider_customer_id,
    provider_subscription_id=excluded.provider_subscription_id,
    provider_price_id=excluded.provider_price_id,
    current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    accepted_terms_version=coalesce(
      beauty.professional_subscriptions.accepted_terms_version,
      excluded.accepted_terms_version
    ),
    accepted_at=coalesce(
      beauty.professional_subscriptions.accepted_at,
      excluded.accepted_at
    ),
    updated_at=now();
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_payment_worker;
ALTER FUNCTION beauty.apply_professional_subscription(
  uuid,text,text,text,text,text,timestamptz,boolean,text
) OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_payment_worker;

REVOKE ALL ON FUNCTION beauty.apply_professional_subscription(
  uuid,text,text,text,text,text,timestamptz,boolean,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.apply_professional_subscription(
  uuid,text,text,text,text,text,timestamptz,boolean,text
) TO beauty_payment_worker;

-- Full refunds for unshipped product orders.
-- Staged on development branch only. GLOHAUS keeps its platform commission
-- economically due from the professional by recording any uncovered amount as
-- a professional outstanding obligation.

CREATE TABLE beauty.product_order_refund_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES beauty.product_orders(id),
  actor_id uuid NOT NULL REFERENCES beauty.users(id),
  previous_status text NOT NULL CHECK(previous_status IN('paid','processing')),
  amount_pence integer NOT NULL CHECK(amount_pence>0),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
  status text NOT NULL DEFAULT 'queued'
    CHECK(status IN('queued','pending','succeeded','failed')),
  stripe_refund_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beauty.product_order_refund_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.product_order_refund_decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY product_refund_participant_read
ON beauty.product_order_refund_decisions
FOR SELECT TO beauty_app
USING (
  EXISTS(
    SELECT 1
    FROM beauty.product_orders o
    WHERE o.id=order_id
  )
);

GRANT SELECT ON beauty.product_order_refund_decisions TO beauty_app;
GRANT SELECT,INSERT,UPDATE ON beauty.product_order_refund_decisions TO beauty_payment_worker;
CREATE POLICY product_refund_worker
ON beauty.product_order_refund_decisions
FOR ALL TO beauty_payment_worker USING(true) WITH CHECK(true);

GRANT SELECT,UPDATE ON beauty.product_order_refund_decisions TO beauty_order_ops;
CREATE POLICY product_refund_order_ops
ON beauty.product_order_refund_decisions
FOR ALL TO beauty_order_ops USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.request_product_order_refund(
  target uuid,
  decision_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor uuid;
  actor_professional uuid;
  target_order beauty.product_orders;
  existing beauty.product_order_refund_decisions;
  decision beauty.product_order_refund_decisions;
BEGIN
  SELECT u.id,p.id INTO actor,actor_professional
  FROM beauty.users u
  JOIN beauty.professional_profiles p ON p.user_id=u.id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  IF length(trim(coalesce(decision_reason,''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT * INTO target_order
  FROM beauty.product_orders
  WHERE id=target
  FOR UPDATE;

  IF actor IS NULL
    OR actor_professional IS NULL
    OR target_order.id IS NULL
    OR target_order.professional_id<>actor_professional THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO existing
  FROM beauty.product_order_refund_decisions
  WHERE order_id=target_order.id;

  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id',existing.id,
      'amountPence',existing.amount_pence,
      'paymentIntentId',target_order.provider_payment_intent_id,
      'status',existing.status
    );
  END IF;

  IF target_order.status NOT IN('paid','processing')
    OR target_order.shipped_at IS NOT NULL
    OR target_order.stripe_transfer_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.product_order_refund_decisions(
    order_id,actor_id,previous_status,amount_pence,reason
  ) VALUES(
    target_order.id,actor,target_order.status,target_order.total_pence,
    trim(decision_reason)
  )
  RETURNING * INTO decision;

  UPDATE beauty.product_orders
  SET status='refund_pending',updated_at=now()
  WHERE id=target_order.id;

  RETURN jsonb_build_object(
    'id',decision.id,
    'amountPence',decision.amount_pence,
    'paymentIntentId',target_order.provider_payment_intent_id,
    'status',decision.status
  );
END $$;

CREATE FUNCTION beauty.apply_product_order_refund_result(
  target uuid,
  provider_ref text,
  amount integer,
  provider_status text,
  intent_ref text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  decision beauty.product_order_refund_decisions;
  target_order beauty.product_orders;
BEGIN
  SELECT * INTO decision
  FROM beauty.product_order_refund_decisions
  WHERE id=target
  FOR UPDATE;

  SELECT * INTO target_order
  FROM beauty.product_orders
  WHERE id=decision.order_id
  FOR UPDATE;

  IF decision.id IS NULL
    OR target_order.id IS NULL
    OR target_order.provider_payment_intent_id IS DISTINCT FROM intent_ref
    OR intent_ref IS NULL
    OR decision.amount_pence IS DISTINCT FROM amount
    OR amount<=0
    OR provider_ref IS NULL
    OR (
      decision.stripe_refund_id IS NOT NULL
      AND decision.stripe_refund_id<>provider_ref
    ) THEN
    RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
  END IF;

  IF decision.status='succeeded' THEN RETURN; END IF;

  IF provider_status NOT IN(
    'succeeded','pending','failed','canceled','requires_action'
  ) THEN
    RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.product_order_refund_decisions
  SET stripe_refund_id=provider_ref,
      status=CASE
        WHEN provider_status='succeeded' THEN 'succeeded'
        WHEN provider_status IN('failed','canceled') THEN 'failed'
        ELSE 'pending'
      END,
      updated_at=now()
  WHERE id=target;

  UPDATE beauty.product_orders
  SET status=CASE
        WHEN provider_status='succeeded' THEN 'refunded'
        WHEN provider_status IN('failed','canceled') THEN decision.previous_status
        ELSE 'refund_pending'
      END,
      updated_at=now()
  WHERE id=target_order.id;
END $$;

CREATE FUNCTION beauty.record_product_order_refund_finance(
  target_decision uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  decision beauty.product_order_refund_decisions;
  target_order beauty.product_orders;
  amount integer;
  remaining integer;
  pending_balance integer:=0;
  available_balance integer:=0;
  use_pending integer:=0;
  use_available integer:=0;
  obligation integer:=0;
  rows jsonb;
BEGIN
  SELECT * INTO decision
  FROM beauty.product_order_refund_decisions
  WHERE id=target_decision;

  IF decision.id IS NULL OR decision.status<>'succeeded' THEN RETURN; END IF;

  SELECT * INTO target_order
  FROM beauty.product_orders
  WHERE id=decision.order_id;

  IF target_order.id IS NULL OR decision.amount_pence<=0 THEN RETURN; END IF;

  IF EXISTS(
    SELECT 1
    FROM beauty.financial_ledger_transactions
    WHERE event_reference='product-refund:'||decision.id::text
  ) THEN RETURN; END IF;

  SELECT
    greatest(0,coalesce(-sum(e.amount_pence)
      FILTER(WHERE a.code='professional_pending'),0))::integer,
    greatest(0,coalesce(-sum(e.amount_pence)
      FILTER(WHERE a.code='professional_available'),0))::integer
  INTO pending_balance,available_balance
  FROM beauty.financial_ledger_accounts a
  LEFT JOIN beauty.financial_ledger_entries e ON e.account_id=a.id
  WHERE a.professional_id=target_order.professional_id;

  amount:=decision.amount_pence;
  remaining:=amount;

  use_pending:=least(remaining,pending_balance);
  remaining:=remaining-use_pending;

  use_available:=least(remaining,available_balance);
  remaining:=remaining-use_available;

  obligation:=remaining;

  rows:=jsonb_build_array(
    jsonb_build_object(
      'accountCode','provider_clearing',
      'amountPence',-amount
    )
  );

  IF use_pending>0 THEN
    rows:=rows||jsonb_build_array(jsonb_build_object(
      'accountCode','professional_pending',
      'amountPence',use_pending
    ));
  END IF;

  IF use_available>0 THEN
    rows:=rows||jsonb_build_array(jsonb_build_object(
      'accountCode','professional_available',
      'amountPence',use_available
    ));
  END IF;

  IF obligation>0 THEN
    rows:=rows||jsonb_build_array(jsonb_build_object(
      'accountCode','professional_outstanding_obligation',
      'amountPence',obligation
    ));
  END IF;

  PERFORM beauty.record_financial_ledger(
    'product-refund:'||decision.id::text,
    'refund',
    'product_order',
    target_order.id,
    target_order.professional_id,
    jsonb_build_object(
      'orderId',target_order.id,
      'customerRefundPence',amount,
      'professionalRecoveredPence',amount-obligation,
      'professionalObligationPence',obligation,
      'platformFeesPreserved',true
    ),
    rows
  );
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_order_ops,beauty_payment_worker;
ALTER FUNCTION beauty.request_product_order_refund(uuid,text)
  OWNER TO beauty_order_ops;
ALTER FUNCTION beauty.apply_product_order_refund_result(uuid,text,integer,text,text)
  OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.record_product_order_refund_finance(uuid)
  OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_order_ops,beauty_payment_worker;

REVOKE ALL ON FUNCTION
  beauty.request_product_order_refund(uuid,text),
  beauty.apply_product_order_refund_result(uuid,text,integer,text,text),
  beauty.record_product_order_refund_finance(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION beauty.request_product_order_refund(uuid,text)
TO beauty_app;

GRANT EXECUTE ON FUNCTION
  beauty.apply_product_order_refund_result(uuid,text,integer,text,text),
  beauty.record_product_order_refund_finance(uuid)
TO beauty_payment_worker;

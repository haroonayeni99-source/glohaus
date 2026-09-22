-- Financial records are append-only journal entries. This migration creates no
-- live provider charge, transfer, payout, or customer balance.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beauty_financial_worker') THEN
    CREATE ROLE beauty_financial_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
-- Required only for the Supabase postgres migration owner to transfer the
-- restricted financial functions below.
GRANT beauty_financial_worker TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_financial_worker;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_financial_worker;

-- Only a controlled operator procedure can grant these roles. They are never
-- eligible during self-enrolment.
ALTER TABLE beauty.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE beauty.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('customer','professional','admin','staff','owner'));

CREATE FUNCTION beauty.require_owner() RETURNS uuid LANGUAGE plpgsql
  SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id
  WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND r.role='owner';
  IF actor IS NULL OR current_setting('app.admin_verified',true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN actor;
END $$;
-- PostgreSQL requires the receiving owner to have CREATE on the schema during
-- an ownership transfer. This is removed immediately after the transfer.
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.require_owner() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.require_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.require_owner() TO beauty_admin_ops;

-- These values are prospective policies. A payment always retains a separate,
-- immutable quote, so updating a rule cannot rewrite historical charges.
CREATE TABLE beauty.financial_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_kind text NOT NULL CHECK(transaction_kind IN ('booking','product','tip','withdrawal','promotion')),
  category_key text CHECK(category_key IS NULL OR length(category_key) BETWEEN 1 AND 80),
  fee_payer text NOT NULL CHECK(fee_payer IN ('customer','professional')),
  percentage_basis_points integer NOT NULL CHECK(percentage_basis_points BETWEEN 0 AND 10000),
  fixed_fee_pence integer NOT NULL DEFAULT 0 CHECK(fixed_fee_pence BETWEEN 0 AND 100000),
  minimum_fee_pence integer NOT NULL DEFAULT 0 CHECK(minimum_fee_pence BETWEEN 0 AND 100000),
  maximum_fee_pence integer CHECK(maximum_fee_pence IS NULL OR maximum_fee_pence BETWEEN 0 AND 100000),
  minimum_transaction_pence integer NOT NULL DEFAULT 1 CHECK(minimum_transaction_pence BETWEEN 1 AND 100000000),
  processing_cost_payer text NOT NULL DEFAULT 'platform' CHECK(processing_cost_payer IN ('platform','professional')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES beauty.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(maximum_fee_pence IS NULL OR maximum_fee_pence >= minimum_fee_pence),
  CHECK(effective_until IS NULL OR effective_until > effective_from)
);
CREATE INDEX financial_fee_rules_lookup ON beauty.financial_fee_rules(transaction_kind,category_key,effective_from DESC) WHERE active;

CREATE TABLE beauty.financial_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid UNIQUE REFERENCES beauty.bookings(id),
  fee_rule_id uuid REFERENCES beauty.financial_fee_rules(id),
  currency text NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
  service_value_pence integer NOT NULL CHECK(service_value_pence>0),
  payable_now_pence integer NOT NULL CHECK(payable_now_pence>0 AND payable_now_pence<=service_value_pence),
  customer_platform_fee_pence integer NOT NULL DEFAULT 0 CHECK(customer_platform_fee_pence>=0),
  professional_platform_fee_pence integer NOT NULL DEFAULT 0 CHECK(professional_platform_fee_pence>=0),
  estimated_provider_cost_pence integer NOT NULL DEFAULT 0 CHECK(estimated_provider_cost_pence>=0),
  professional_processing_cost_pence integer NOT NULL DEFAULT 0 CHECK(professional_processing_cost_pence>=0),
  customer_total_pence integer NOT NULL CHECK(customer_total_pence>0),
  professional_proceeds_pence integer NOT NULL CHECK(professional_proceeds_pence>=0),
  platform_gross_revenue_pence integer NOT NULL CHECK(platform_gross_revenue_pence>=0),
  platform_net_revenue_pence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(customer_total_pence = payable_now_pence + customer_platform_fee_pence),
  CHECK(platform_gross_revenue_pence = customer_platform_fee_pence + professional_platform_fee_pence),
  CHECK(professional_proceeds_pence = payable_now_pence - professional_platform_fee_pence - professional_processing_cost_pence)
);

-- Account normal balance makes wallet balances derivable from journal entries.
-- No editable wallet_balance column exists anywhere in this schema.
CREATE TABLE beauty.financial_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES beauty.professional_profiles(id),
  code text NOT NULL CHECK(code IN (
    'provider_clearing','platform_fee_revenue','provider_cost','platform_adjustment',
    'professional_pending','professional_available','professional_reserved',
    'professional_processing','professional_disputed','professional_tax_pot',
    'professional_outstanding_obligation'
  )),
  currency text NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
  normal_balance text NOT NULL CHECK(normal_balance IN ('debit','credit')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((professional_id IS NULL AND code IN ('provider_clearing','platform_fee_revenue','provider_cost','platform_adjustment'))
    OR (professional_id IS NOT NULL AND code IN ('professional_pending','professional_available','professional_reserved','professional_processing','professional_disputed','professional_tax_pot','professional_outstanding_obligation')))
);
CREATE UNIQUE INDEX financial_platform_account_unique ON beauty.financial_ledger_accounts(code,currency) WHERE professional_id IS NULL;
CREATE UNIQUE INDEX financial_professional_account_unique ON beauty.financial_ledger_accounts(professional_id,code,currency) WHERE professional_id IS NOT NULL;

CREATE TABLE beauty.financial_ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_reference text NOT NULL UNIQUE CHECK(length(event_reference) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK(kind IN ('payment','proceeds_pending','release','reserve','reserve_release','dispute','refund','chargeback','payout','withdrawal_fee','obligation','recovery','admin_adjustment')),
  reference_type text NOT NULL CHECK(reference_type IN ('booking','product_order','payout','dispute','refund','admin')),
  reference_id uuid,
  professional_id uuid REFERENCES beauty.professional_profiles(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  posted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_ledger_transactions_professional ON beauty.financial_ledger_transactions(professional_id,posted_at DESC);
CREATE INDEX financial_ledger_transactions_reference ON beauty.financial_ledger_transactions(reference_type,reference_id,posted_at DESC);

CREATE TABLE beauty.financial_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES beauty.financial_ledger_transactions(id),
  account_id uuid NOT NULL REFERENCES beauty.financial_ledger_accounts(id),
  -- Debit is positive and credit is negative. Every transaction must sum to 0.
  amount_pence integer NOT NULL CHECK(amount_pence<>0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_ledger_entries_transaction ON beauty.financial_ledger_entries(transaction_id);
CREATE INDEX financial_ledger_entries_account ON beauty.financial_ledger_entries(account_id,created_at DESC);

CREATE TABLE beauty.professional_financial_controls (
  professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
  withdrawals_blocked boolean NOT NULL DEFAULT false,
  paid_bookings_blocked boolean NOT NULL DEFAULT false,
  selling_blocked boolean NOT NULL DEFAULT false,
  instant_payout_blocked boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'clear' CHECK(review_status IN ('clear','under_review','restricted')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES beauty.users(id)
);

CREATE TABLE beauty.financial_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  kind text NOT NULL CHECK(kind IN ('standard','instant')),
  requested_pence integer NOT NULL CHECK(requested_pence>0),
  withdrawal_fee_pence integer NOT NULL DEFAULT 0 CHECK(withdrawal_fee_pence>=0 AND withdrawal_fee_pence<=requested_pence),
  bank_amount_pence integer NOT NULL CHECK(bank_amount_pence>=0),
  expected_arrival_at timestamptz,
  provider_payout_id text UNIQUE,
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','processing','paid','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(bank_amount_pence = requested_pence - withdrawal_fee_pence)
);
CREATE INDEX financial_payouts_professional ON beauty.financial_payouts(professional_id,created_at DESC);

CREATE TABLE beauty.professional_tax_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  user_id uuid NOT NULL REFERENCES beauty.users(id),
  terms_version text NOT NULL CHECK(length(terms_version) BETWEEN 1 AND 80),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(professional_id,terms_version)
);

CREATE TABLE beauty.financial_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES beauty.users(id),
  action text NOT NULL CHECK(length(action) BETWEEN 3 AND 160),
  target_type text NOT NULL CHECK(length(target_type) BETWEEN 3 AND 80),
  target_id uuid,
  reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),
  previous_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(previous_state) IN ('object','array')),
  new_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(new_state)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_admin_audit_actor ON beauty.financial_admin_audit_logs(actor_user_id,created_at DESC);

ALTER TABLE beauty.financial_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_fee_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_ledger_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_ledger_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_ledger_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_financial_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_financial_controls FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_payouts FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_tax_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_tax_acknowledgements FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_admin_audit_logs FORCE ROW LEVEL SECURITY;

-- Direct browser/runtime access is intentionally absent. The worker is only
-- entered by trusted server code after payment-provider webhook verification.
GRANT SELECT,INSERT,UPDATE ON beauty.financial_fee_rules TO beauty_admin_ops;
GRANT SELECT ON beauty.financial_quotes,beauty.financial_ledger_accounts,beauty.financial_ledger_transactions,beauty.financial_ledger_entries,beauty.professional_financial_controls,beauty.financial_payouts,beauty.professional_tax_acknowledgements TO beauty_admin_ops;
GRANT INSERT ON beauty.financial_admin_audit_logs TO beauty_admin_ops;
CREATE POLICY finance_admin_fee_rules ON beauty.financial_fee_rules FOR ALL TO beauty_admin_ops USING(true) WITH CHECK(true);
CREATE POLICY finance_admin_quotes ON beauty.financial_quotes FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY finance_admin_accounts ON beauty.financial_ledger_accounts FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY finance_admin_transactions ON beauty.financial_ledger_transactions FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY finance_admin_entries ON beauty.financial_ledger_entries FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY finance_admin_controls ON beauty.professional_financial_controls FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY finance_admin_payouts ON beauty.financial_payouts FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY finance_admin_tax ON beauty.professional_tax_acknowledgements FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY finance_admin_audit_insert ON beauty.financial_admin_audit_logs FOR INSERT TO beauty_admin_ops WITH CHECK(true);

GRANT SELECT,INSERT,UPDATE ON beauty.financial_fee_rules,beauty.financial_quotes,beauty.financial_ledger_accounts,beauty.financial_ledger_transactions,beauty.financial_ledger_entries,beauty.professional_financial_controls,beauty.financial_payouts,beauty.professional_tax_acknowledgements TO beauty_financial_worker;
GRANT SELECT ON beauty.users,beauty.user_roles,beauty.professional_profiles TO beauty_financial_worker;
CREATE POLICY finance_worker_fee_rules ON beauty.financial_fee_rules FOR ALL TO beauty_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY finance_worker_quotes ON beauty.financial_quotes FOR ALL TO beauty_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY finance_worker_accounts ON beauty.financial_ledger_accounts FOR ALL TO beauty_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY finance_worker_transactions ON beauty.financial_ledger_transactions FOR ALL TO beauty_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY finance_worker_entries ON beauty.financial_ledger_entries FOR ALL TO beauty_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY finance_worker_controls ON beauty.professional_financial_controls FOR ALL TO beauty_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY finance_worker_payouts ON beauty.financial_payouts FOR ALL TO beauty_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY finance_worker_tax ON beauty.professional_tax_acknowledgements FOR ALL TO beauty_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY finance_worker_users ON beauty.users FOR SELECT TO beauty_financial_worker USING(true);
CREATE POLICY finance_worker_roles ON beauty.user_roles FOR SELECT TO beauty_financial_worker USING(true);
CREATE POLICY finance_worker_profiles ON beauty.professional_profiles FOR SELECT TO beauty_financial_worker USING(true);

CREATE FUNCTION beauty.ensure_financial_accounts(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=target) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';
  END IF;
  INSERT INTO beauty.financial_ledger_accounts(code,currency,normal_balance) VALUES
    ('provider_clearing','GBP','debit'),
    ('platform_fee_revenue','GBP','credit'),
    ('provider_cost','GBP','debit'),
    ('platform_adjustment','GBP','credit')
  ON CONFLICT DO NOTHING;
  INSERT INTO beauty.financial_ledger_accounts(professional_id,code,currency,normal_balance) VALUES
    (target,'professional_pending','GBP','credit'),
    (target,'professional_available','GBP','credit'),
    (target,'professional_reserved','GBP','credit'),
    (target,'professional_processing','GBP','credit'),
    (target,'professional_disputed','GBP','credit'),
    (target,'professional_tax_pot','GBP','credit'),
    (target,'professional_outstanding_obligation','GBP','debit')
  ON CONFLICT DO NOTHING;
  INSERT INTO beauty.professional_financial_controls(professional_id) VALUES(target) ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION beauty.record_financial_ledger(
  event_ref text,
  entry_kind text,
  source_type text,
  source_id uuid,
  target_professional uuid,
  entry_metadata jsonb,
  entry_rows jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result_id uuid; row_data jsonb; account_ref uuid; account_professional uuid; account_code text; signed_amount integer; entries_count integer; signed_total bigint;
BEGIN
  IF length(trim(event_ref)) NOT BETWEEN 1 AND 200 OR entry_kind NOT IN ('payment','proceeds_pending','release','reserve','reserve_release','dispute','refund','chargeback','payout','withdrawal_fee','obligation','recovery','admin_adjustment') OR source_type NOT IN ('booking','product_order','payout','dispute','refund','admin') OR jsonb_typeof(entry_metadata) IS DISTINCT FROM 'object' OR jsonb_typeof(entry_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  SELECT id INTO result_id FROM beauty.financial_ledger_transactions WHERE event_reference=event_ref;
  IF result_id IS NOT NULL THEN RETURN result_id; END IF;
  PERFORM beauty.ensure_financial_accounts(target_professional);
  INSERT INTO beauty.financial_ledger_transactions(event_reference,kind,reference_type,reference_id,professional_id,metadata)
    VALUES(trim(event_ref),entry_kind,source_type,source_id,target_professional,entry_metadata)
    RETURNING id INTO result_id;
  FOR row_data IN SELECT value FROM jsonb_array_elements(entry_rows) LOOP
    account_code := nullif(trim(row_data->>'accountCode'),'');
    signed_amount := nullif(row_data->>'amountPence','')::integer;
    IF account_code IS NULL OR signed_amount IS NULL OR signed_amount=0 THEN
      RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
    END IF;
    SELECT id,professional_id INTO account_ref,account_professional FROM beauty.financial_ledger_accounts
      WHERE code=account_code AND currency='GBP' AND (professional_id IS NULL OR professional_id=target_professional)
      ORDER BY professional_id NULLS LAST LIMIT 1;
    IF NOT FOUND OR (account_professional IS NOT NULL AND account_professional IS DISTINCT FROM target_professional) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
    END IF;
    INSERT INTO beauty.financial_ledger_entries(transaction_id,account_id,amount_pence)
      VALUES(result_id,account_ref,signed_amount);
  END LOOP;
  SELECT count(*),coalesce(sum(amount_pence),0) INTO entries_count,signed_total FROM beauty.financial_ledger_entries WHERE transaction_id=result_id;
  IF entries_count<2 OR signed_total<>0 THEN RAISE EXCEPTION 'UNBALANCED_LEDGER' USING ERRCODE='22023'; END IF;
  RETURN result_id;
END $$;

CREATE FUNCTION beauty.my_wallet_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;
BEGIN
  SELECT p.id INTO target FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id JOIN beauty.user_roles r ON r.user_id=u.id
  WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND r.role='professional';
  IF target IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM beauty.ensure_financial_accounts(target);
  RETURN (
    SELECT jsonb_build_object(
      'pendingPence',greatest(0,coalesce(-sum(e.amount_pence) FILTER(WHERE a.code='professional_pending'),0)),
      'availablePence',greatest(0,coalesce(-sum(e.amount_pence) FILTER(WHERE a.code='professional_available'),0)),
      'reservedPence',greatest(0,coalesce(-sum(e.amount_pence) FILTER(WHERE a.code='professional_reserved'),0)),
      'processingPence',greatest(0,coalesce(-sum(e.amount_pence) FILTER(WHERE a.code='professional_processing'),0)),
      'disputedPence',greatest(0,coalesce(-sum(e.amount_pence) FILTER(WHERE a.code='professional_disputed'),0)),
      'taxPotPence',greatest(0,coalesce(-sum(e.amount_pence) FILTER(WHERE a.code='professional_tax_pot'),0)),
      'outstandingObligationPence',greatest(0,coalesce(sum(e.amount_pence) FILTER(WHERE a.code='professional_outstanding_obligation'),0)),
      'withdrawalsBlocked',coalesce((SELECT withdrawals_blocked FROM beauty.professional_financial_controls WHERE professional_id=target),false),
      'instantPayoutBlocked',coalesce((SELECT instant_payout_blocked FROM beauty.professional_financial_controls WHERE professional_id=target),false)
    )
    FROM beauty.financial_ledger_accounts a LEFT JOIN beauty.financial_ledger_entries e ON e.account_id=a.id
    WHERE a.professional_id=target
  );
END $$;

CREATE FUNCTION beauty.acknowledge_professional_tax(terms text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_professional uuid; actor uuid;
BEGIN
  SELECT u.id,p.id INTO actor,target_professional FROM beauty.users u JOIN beauty.professional_profiles p ON p.user_id=u.id
  JOIN beauty.user_roles r ON r.user_id=u.id WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND r.role='professional';
  IF actor IS NULL OR target_professional IS NULL OR length(trim(terms)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO beauty.professional_tax_acknowledgements(professional_id,user_id,terms_version) VALUES(target_professional,actor,trim(terms)) ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION beauty.set_financial_fee_rule(
  next_kind text,next_category text,next_payer text,next_basis_points integer,next_fixed_pence integer,next_minimum_fee_pence integer,next_maximum_fee_pence integer,next_minimum_transaction_pence integer,next_processing_cost_payer text,decision_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; prior jsonb; result_id uuid;
BEGIN
  actor:=beauty.require_owner();
  IF next_kind NOT IN ('booking','product','tip','withdrawal','promotion') OR next_payer NOT IN ('customer','professional') OR next_basis_points NOT BETWEEN 0 AND 10000 OR next_fixed_pence NOT BETWEEN 0 AND 100000 OR next_minimum_fee_pence NOT BETWEEN 0 AND 100000 OR (next_maximum_fee_pence IS NOT NULL AND (next_maximum_fee_pence<next_minimum_fee_pence OR next_maximum_fee_pence>100000)) OR next_minimum_transaction_pence NOT BETWEEN 1 AND 100000000 OR next_processing_cost_payer NOT IN ('platform','professional') OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'active',active,'effectiveUntil',effective_until)),'[]'::jsonb) INTO prior FROM beauty.financial_fee_rules WHERE transaction_kind=next_kind AND category_key IS NOT DISTINCT FROM nullif(trim(next_category),'') AND active;
  UPDATE beauty.financial_fee_rules SET active=false,effective_until=now() WHERE transaction_kind=next_kind AND category_key IS NOT DISTINCT FROM nullif(trim(next_category),'') AND active;
  INSERT INTO beauty.financial_fee_rules(transaction_kind,category_key,fee_payer,percentage_basis_points,fixed_fee_pence,minimum_fee_pence,maximum_fee_pence,minimum_transaction_pence,processing_cost_payer,created_by_user_id)
  VALUES(next_kind,nullif(trim(next_category),''),next_payer,next_basis_points,next_fixed_pence,next_minimum_fee_pence,next_maximum_fee_pence,next_minimum_transaction_pence,next_processing_cost_payer,actor) RETURNING id INTO result_id;
  INSERT INTO beauty.financial_admin_audit_logs(actor_user_id,action,target_type,target_id,reason,previous_state,new_state) VALUES(actor,'financial_fee_rule.created','financial_fee_rule',result_id,trim(decision_reason),prior,jsonb_build_object('id',result_id,'transactionKind',next_kind,'category',nullif(trim(next_category),''),'feePayer',next_payer,'percentageBasisPoints',next_basis_points,'fixedFeePence',next_fixed_pence,'minimumFeePence',next_minimum_fee_pence,'maximumFeePence',next_maximum_fee_pence,'minimumTransactionPence',next_minimum_transaction_pence,'processingCostPayer',next_processing_cost_payer));
  RETURN result_id;
END $$;

-- Both restricted function owners need temporary schema CREATE permission for
-- the ownership transfers below; neither retains it at runtime.
GRANT CREATE ON SCHEMA beauty TO beauty_financial_worker,beauty_admin_ops;
ALTER FUNCTION beauty.ensure_financial_accounts(uuid) OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.record_financial_ledger(text,text,text,uuid,uuid,jsonb,jsonb) OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.my_wallet_overview() OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.acknowledge_professional_tax(text) OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.set_financial_fee_rule(text,text,text,integer,integer,integer,integer,integer,text,text) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_financial_worker,beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.ensure_financial_accounts(uuid),beauty.record_financial_ledger(text,text,text,uuid,uuid,jsonb,jsonb),beauty.my_wallet_overview(),beauty.acknowledge_professional_tax(text),beauty.set_financial_fee_rule(text,text,text,integer,integer,integer,integer,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.record_financial_ledger(text,text,text,uuid,uuid,jsonb,jsonb) TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.my_wallet_overview(),beauty.acknowledge_professional_tax(text) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.set_financial_fee_rule(text,text,text,integer,integer,integer,integer,integer,text,text) TO beauty_app;

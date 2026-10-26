-- Preserve the existing financial policy function; add durable request identity
-- and short processing leases around it. No existing balance or fee is changed.
SET LOCAL lock_timeout = '5s';
CREATE TABLE beauty.financial_payout_requests (
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  request_key uuid NOT NULL,
  payout_id uuid NOT NULL UNIQUE REFERENCES beauty.financial_payouts(id),
  stripe_account_id text NOT NULL,
  lease_id uuid NOT NULL,
  leased_until timestamptz NOT NULL,
  issue_code text CHECK(issue_code IN ('PROVIDER_OUTCOME_UNKNOWN','REVERSAL_PENDING','PROVIDER_DETAILS_MISMATCH','PROVIDER_CONFIRMATION_PENDING')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(professional_id,request_key)
);
ALTER TABLE beauty.financial_payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.financial_payout_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.financial_payout_requests FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT,UPDATE ON beauty.financial_payout_requests TO beauty_financial_worker;
GRANT SELECT,UPDATE ON beauty.financial_payout_requests TO beauty_payment_worker;
CREATE POLICY payout_request_finance ON beauty.financial_payout_requests TO beauty_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY payout_request_worker ON beauty.financial_payout_requests TO beauty_payment_worker USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.professional_payment_accounts TO beauty_financial_worker;
CREATE POLICY payout_request_connect_owner ON beauty.professional_payment_accounts FOR SELECT TO beauty_financial_worker
USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id
 WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'));

CREATE FUNCTION beauty.request_my_payout_once(payout_kind text,amount_pence integer,request_key uuid,lease_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid; account_ref text; payout beauty.financial_payouts; claim beauty.financial_payout_requests; created jsonb; claimed boolean:=false;
BEGIN
 SELECT p.id INTO pro FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id
 JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
 WHERE u.auth_id=beauty.auth_id() AND u.status='active';
 IF pro IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF request_key IS NULL OR lease_key IS NULL OR payout_kind IS NULL OR payout_kind NOT IN('standard','instant')
 OR amount_pence IS NULL OR amount_pence<100 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(pro::text,0));
 SELECT * INTO claim FROM beauty.financial_payout_requests r WHERE r.professional_id=pro AND r.request_key=request_my_payout_once.request_key FOR UPDATE;
 IF claim.payout_id IS NULL THEN
  SELECT stripe_account_id INTO account_ref FROM beauty.professional_payment_accounts WHERE professional_id=pro AND charges_enabled;
  IF account_ref IS NULL THEN RAISE EXCEPTION 'ONBOARDING_REQUIRED' USING ERRCODE='42501'; END IF;
  -- This call retains all existing identity, dispute, balance, fee and risk checks.
  created:=beauty.request_my_payout(payout_kind,amount_pence);
  INSERT INTO beauty.financial_payout_requests(professional_id,request_key,payout_id,stripe_account_id,lease_id,leased_until)
  VALUES(pro,request_key,(created->>'id')::uuid,account_ref,lease_key,now()+interval '2 minutes') RETURNING * INTO claim;
  claimed:=true;
 END IF;
 SELECT * INTO payout FROM beauty.financial_payouts WHERE id=claim.payout_id AND professional_id=pro FOR UPDATE;
 IF payout.kind IS DISTINCT FROM payout_kind OR payout.requested_pence IS DISTINCT FROM amount_pence THEN
  RAISE EXCEPTION 'IDEMPOTENCY_MISMATCH' USING ERRCODE='22023';
 END IF;
 IF NOT claimed AND payout.status='requested' AND claim.created_at>now()-interval '23 hours' AND claim.leased_until<=now() THEN
  UPDATE beauty.financial_payout_requests SET lease_id=lease_key,leased_until=now()+interval '2 minutes' WHERE payout_id=payout.id;
  claimed:=true;
 END IF;
 RETURN jsonb_build_object('id',payout.id,'kind',payout.kind,'requestedPence',payout.requested_pence,
 'withdrawalFeePence',payout.withdrawal_fee_pence,'bankAmountPence',payout.bank_amount_pence,'status',payout.status,
 'expectedArrivalAt',payout.expected_arrival_at,'createdAt',claim.created_at,'claimed',claimed,
 'stripeAccountId',claim.stripe_account_id,'providerTransferId',payout.provider_transfer_id,'providerPayoutId',payout.provider_payout_id);
END $$;

CREATE FUNCTION beauty.my_payout_summary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid; BEGIN
 SELECT p.id INTO pro FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id
 JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
 WHERE u.auth_id=beauty.auth_id() AND u.status='active';
 IF pro IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('totalPaidPence',(SELECT coalesce(sum(bank_amount_pence),0) FROM beauty.financial_payouts WHERE professional_id=pro AND status='paid'),
 'history',beauty.my_payout_history());
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_financial_worker;
ALTER FUNCTION beauty.my_payout_summary() OWNER TO beauty_financial_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_financial_worker;
REVOKE ALL ON FUNCTION beauty.my_payout_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.my_payout_summary() TO beauty_app;
GRANT CREATE ON SCHEMA beauty TO beauty_financial_worker;
ALTER FUNCTION beauty.request_my_payout_once(text,integer,uuid,uuid) OWNER TO beauty_financial_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_financial_worker;
REVOKE ALL ON FUNCTION beauty.request_my_payout_once(text,integer,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.request_my_payout_once(text,integer,uuid,uuid) TO beauty_app;

-- A bank can return a payout after previously reporting it paid. Reverse the
-- original clearing entry in that case, rather than re-debiting processing.
DO $$ DECLARE definition text; failure_account text:=$needle$'accountCode','professional_processing',
            'amountPence',payout.bank_amount_pence$needle$; BEGIN
 definition:=pg_get_functiondef('beauty.apply_payout_result(text,text)'::regprocedure);
 IF position('IF payout.status NOT IN (''requested'',''processing'') THEN' IN definition)=0 THEN
  RAISE EXCEPTION 'Payout result function needs separate review';
 END IF;
 IF (length(definition)-length(replace(definition,failure_account,'')))/length(failure_account)<>2 THEN
  RAISE EXCEPTION 'Payout failure journal needs separate review';
 END IF;
 definition:=replace(definition,'IF payout.status NOT IN (''requested'',''processing'') THEN',
 'IF payout.status NOT IN (''requested'',''processing'') AND NOT (payout.status=''paid'' AND next_status IN (''failed'',''cancelled'')) THEN');
 -- Replace only the failure branch, leaving successful payout postings intact.
 definition:=replace(definition,'''accountCode'',''professional_processing'',
            ''amountPence'',payout.bank_amount_pence',
 '''accountCode'',CASE WHEN payout.status=''paid'' THEN ''provider_clearing'' ELSE ''professional_processing'' END,
            ''amountPence'',payout.bank_amount_pence');
 EXECUTE definition;
END $$;

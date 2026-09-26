-- Professional-controlled withdrawals: standard is free; instant is 4%.
-- Requests reserve wallet funds atomically so the internal balance can never
-- become negative. Stripe provider references are recorded by the payment worker.

ALTER TABLE beauty.financial_payouts
  ADD COLUMN provider_transfer_id text UNIQUE,
  ADD COLUMN provider_application_fee_id text UNIQUE;

CREATE OR REPLACE FUNCTION beauty.request_my_payout(
  payout_kind text,
  amount_pence integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  target_professional uuid;
  controls beauty.professional_financial_controls;
  available integer;
  outstanding integer;
  fee integer:=0;
  bank_amount integer;
  result beauty.financial_payouts;
BEGIN
  SELECT p.id INTO target_professional
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  IF target_professional IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF payout_kind NOT IN ('standard','instant')
    OR amount_pence IS NULL OR amount_pence<100 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(target_professional::text,0));
  PERFORM beauty.ensure_financial_accounts(target_professional);

  SELECT * INTO controls
  FROM beauty.professional_financial_controls
  WHERE professional_id=target_professional
  FOR UPDATE;

  IF controls.withdrawals_blocked
    OR controls.review_status<>'clear'
    OR (payout_kind='instant' AND controls.instant_payout_blocked) THEN
    RAISE EXCEPTION 'PAYOUT_RESTRICTED' USING ERRCODE='42501';
  END IF;

  SELECT
    greatest(0,coalesce(-sum(e.amount_pence)
      FILTER(WHERE a.code='professional_available'),0))::integer,
    greatest(0,coalesce(sum(e.amount_pence)
      FILTER(WHERE a.code='professional_outstanding_obligation'),0))::integer
  INTO available,outstanding
  FROM beauty.financial_ledger_accounts a
  LEFT JOIN beauty.financial_ledger_entries e ON e.account_id=a.id
  WHERE a.professional_id=target_professional;

  IF outstanding>0 THEN
    RAISE EXCEPTION 'OUTSTANDING_OBLIGATION' USING ERRCODE='42501';
  END IF;
  IF amount_pence>available THEN
    RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_BALANCE' USING ERRCODE='22023';
  END IF;

  IF payout_kind='instant' THEN
    fee:=round(amount_pence*400/10000.0)::integer;
  END IF;
  bank_amount:=amount_pence-fee;

  -- Keep well above Stripe's current GBP instant minimum and avoid zero-value
  -- provider operations.
  IF bank_amount<40 THEN
    RAISE EXCEPTION 'PAYOUT_TOO_SMALL' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.financial_payouts(
    professional_id,kind,requested_pence,withdrawal_fee_pence,
    bank_amount_pence,status
  ) VALUES(
    target_professional,payout_kind,amount_pence,fee,bank_amount,'requested'
  )
  RETURNING * INTO result;

  PERFORM beauty.record_financial_ledger(
    'payout-request:'||result.id::text,
    'payout',
    'payout',
    result.id,
    target_professional,
    jsonb_build_object(
      'kind',payout_kind,
      'requestedPence',amount_pence,
      'withdrawalFeePence',fee,
      'bankAmountPence',bank_amount
    ),
    CASE
      WHEN fee>0 THEN jsonb_build_array(
        jsonb_build_object(
          'accountCode','professional_available','amountPence',amount_pence
        ),
        jsonb_build_object(
          'accountCode','professional_processing','amountPence',-bank_amount
        ),
        jsonb_build_object(
          'accountCode','platform_fee_revenue','amountPence',-fee
        )
      )
      ELSE jsonb_build_array(
        jsonb_build_object(
          'accountCode','professional_available','amountPence',amount_pence
        ),
        jsonb_build_object(
          'accountCode','professional_processing','amountPence',-bank_amount
        )
      )
    END
  );

  RETURN jsonb_build_object(
    'id',result.id,
    'kind',result.kind,
    'requestedPence',result.requested_pence,
    'withdrawalFeePence',result.withdrawal_fee_pence,
    'bankAmountPence',result.bank_amount_pence,
    'status',result.status
  );
END $$;

CREATE OR REPLACE FUNCTION beauty.record_payout_provider(
  target uuid,
  transfer_ref text,
  payout_ref text,
  application_fee_ref text,
  provider_fee_pence integer,
  arrival_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE payout beauty.financial_payouts;
BEGIN
  SELECT * INTO payout
  FROM beauty.financial_payouts
  WHERE id=target
  FOR UPDATE;

  IF payout.id IS NULL
    OR length(trim(coalesce(transfer_ref,'')))<3
    OR length(trim(coalesce(payout_ref,'')))<3 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  IF payout.provider_payout_id IS NOT NULL THEN
    IF payout.provider_payout_id IS DISTINCT FROM payout_ref
      OR payout.provider_transfer_id IS DISTINCT FROM transfer_ref THEN
      RAISE EXCEPTION 'PAYOUT_MISMATCH' USING ERRCODE='22023';
    END IF;
    RETURN;
  END IF;

  IF payout.status<>'requested' THEN
    RAISE EXCEPTION 'PAYOUT_NOT_REQUESTED' USING ERRCODE='22023';
  END IF;

  IF payout.kind='instant' THEN
    IF provider_fee_pence IS DISTINCT FROM payout.withdrawal_fee_pence
      OR length(trim(coalesce(application_fee_ref,'')))<3 THEN
      RAISE EXCEPTION 'INSTANT_FEE_MISMATCH' USING ERRCODE='22023';
    END IF;
  ELSIF coalesce(provider_fee_pence,0)<>0 THEN
    RAISE EXCEPTION 'STANDARD_PAYOUT_FEE' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.financial_payouts
  SET provider_transfer_id=trim(transfer_ref),
      provider_payout_id=trim(payout_ref),
      provider_application_fee_id=nullif(trim(application_fee_ref),''),
      expected_arrival_at=arrival_at,
      status='processing',
      updated_at=now()
  WHERE id=target;
END $$;

CREATE OR REPLACE FUNCTION beauty.apply_payout_result(
  payout_ref text,
  next_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE payout beauty.financial_payouts;
BEGIN
  IF next_status NOT IN ('paid','failed','cancelled') THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT * INTO payout
  FROM beauty.financial_payouts
  WHERE provider_payout_id=payout_ref
  FOR UPDATE;

  IF payout.id IS NULL THEN
    RETURN;
  END IF;
  IF payout.status=next_status THEN
    RETURN;
  END IF;
  IF payout.status NOT IN ('requested','processing') THEN
    RAISE EXCEPTION 'PAYOUT_STATE_MISMATCH' USING ERRCODE='22023';
  END IF;

  IF next_status='paid' THEN
    PERFORM beauty.record_financial_ledger(
      'payout-paid:'||payout.id::text,
      'payout',
      'payout',
      payout.id,
      payout.professional_id,
      jsonb_build_object(
        'providerPayoutId',payout.provider_payout_id,
        'kind',payout.kind
      ),
      jsonb_build_array(
        jsonb_build_object(
          'accountCode','professional_processing',
          'amountPence',payout.bank_amount_pence
        ),
        jsonb_build_object(
          'accountCode','provider_clearing',
          'amountPence',-payout.bank_amount_pence
        )
      )
    );
  ELSE
    PERFORM beauty.record_financial_ledger(
      'payout-reversal:'||payout.id::text,
      'recovery',
      'payout',
      payout.id,
      payout.professional_id,
      jsonb_build_object(
        'providerPayoutId',payout.provider_payout_id,
        'providerTransferId',payout.provider_transfer_id,
        'reason',next_status
      ),
      CASE
        WHEN payout.withdrawal_fee_pence>0 THEN jsonb_build_array(
          jsonb_build_object(
            'accountCode','professional_processing',
            'amountPence',payout.bank_amount_pence
          ),
          jsonb_build_object(
            'accountCode','platform_fee_revenue',
            'amountPence',payout.withdrawal_fee_pence
          ),
          jsonb_build_object(
            'accountCode','professional_available',
            'amountPence',-payout.requested_pence
          )
        )
        ELSE jsonb_build_array(
          jsonb_build_object(
            'accountCode','professional_processing',
            'amountPence',payout.bank_amount_pence
          ),
          jsonb_build_object(
            'accountCode','professional_available',
            'amountPence',-payout.requested_pence
          )
        )
      END
    );
  END IF;

  UPDATE beauty.financial_payouts
  SET status=next_status,updated_at=now()
  WHERE id=payout.id;
END $$;

CREATE OR REPLACE FUNCTION beauty.my_payout_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE target uuid;
BEGIN
  SELECT p.id INTO target
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  IF target IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',p.id,
      'kind',p.kind,
      'requestedPence',p.requested_pence,
      'withdrawalFeePence',p.withdrawal_fee_pence,
      'bankAmountPence',p.bank_amount_pence,
      'status',p.status,
      'expectedArrivalAt',p.expected_arrival_at,
      'createdAt',p.created_at
    ) ORDER BY p.created_at DESC)
    FROM (
      SELECT * FROM beauty.financial_payouts
      WHERE professional_id=target
      ORDER BY created_at DESC
      LIMIT 50
    ) p
  ),'[]'::jsonb);
END $$;


CREATE OR REPLACE FUNCTION beauty.cancel_requested_payout(target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $
DECLARE payout beauty.financial_payouts;
BEGIN
  SELECT * INTO payout
  FROM beauty.financial_payouts
  WHERE id=target
  FOR UPDATE;

  IF payout.id IS NULL OR payout.status='cancelled' THEN RETURN; END IF;
  IF payout.status<>'requested' OR payout.provider_payout_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAYOUT_STATE_MISMATCH' USING ERRCODE='22023';
  END IF;

  PERFORM beauty.record_financial_ledger(
    'payout-reversal:'||payout.id::text,
    'recovery','payout',payout.id,payout.professional_id,
    jsonb_build_object('reason','provider_setup_failed'),
    CASE WHEN payout.withdrawal_fee_pence>0 THEN jsonb_build_array(
      jsonb_build_object('accountCode','professional_processing','amountPence',payout.bank_amount_pence),
      jsonb_build_object('accountCode','platform_fee_revenue','amountPence',payout.withdrawal_fee_pence),
      jsonb_build_object('accountCode','professional_available','amountPence',-payout.requested_pence)
    ) ELSE jsonb_build_array(
      jsonb_build_object('accountCode','professional_processing','amountPence',payout.bank_amount_pence),
      jsonb_build_object('accountCode','professional_available','amountPence',-payout.requested_pence)
    ) END
  );

  UPDATE beauty.financial_payouts
  SET status='cancelled',updated_at=now()
  WHERE id=payout.id;
END $;

GRANT CREATE ON SCHEMA beauty TO beauty_financial_worker,beauty_payment_worker;
ALTER FUNCTION beauty.request_my_payout(text,integer) OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.my_payout_history() OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.record_payout_provider(uuid,text,text,text,integer,timestamptz)
  OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.apply_payout_result(text,text) OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.cancel_requested_payout(uuid) OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_financial_worker,beauty_payment_worker;

REVOKE ALL ON FUNCTION
  beauty.request_my_payout(text,integer),
  beauty.my_payout_history(),
  beauty.record_payout_provider(uuid,text,text,text,integer,timestamptz),
  beauty.apply_payout_result(text,text),
  beauty.cancel_requested_payout(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  beauty.request_my_payout(text,integer),
  beauty.my_payout_history()
TO beauty_app;

GRANT EXECUTE ON FUNCTION
  beauty.record_payout_provider(uuid,text,text,text,integer,timestamptz),
  beauty.apply_payout_result(text,text),
  beauty.cancel_requested_payout(uuid)
TO beauty_payment_worker;

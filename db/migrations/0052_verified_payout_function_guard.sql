-- Require identity verification inside the payout function itself.
-- This prevents alternate server paths from creating withdrawals for an
-- unverified professional even if they bypass the normal API pre-check.

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

  PERFORM beauty.assert_my_professional_verified();

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
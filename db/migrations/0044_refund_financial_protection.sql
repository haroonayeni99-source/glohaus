-- Protect GLOHAUS revenue when a booking refund succeeds.
-- Refunds are platform-charge refunds: professional balances are recovered
-- first and any shortfall becomes a professional outstanding obligation.

GRANT SELECT ON beauty.refund_decisions TO beauty_payment_worker;
CREATE POLICY refund_payment_worker
ON beauty.refund_decisions
FOR SELECT TO beauty_payment_worker USING(true);

GRANT SELECT ON beauty.financial_ledger_accounts,beauty.financial_ledger_entries
TO beauty_payment_worker;
CREATE POLICY refund_ledger_accounts_worker
ON beauty.financial_ledger_accounts
FOR SELECT TO beauty_payment_worker USING(true);
CREATE POLICY refund_ledger_entries_worker
ON beauty.financial_ledger_entries
FOR SELECT TO beauty_payment_worker USING(true);

CREATE OR REPLACE FUNCTION beauty.record_booking_refund_finance(
  target_decision uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  decision beauty.refund_decisions;
  booking beauty.bookings;
  amount integer;
  remaining integer;
  pending_balance integer:=0;
  available_balance integer:=0;
  reserved_balance integer:=0;
  disputed_balance integer:=0;
  use_pending integer:=0;
  use_available integer:=0;
  use_reserved integer:=0;
  use_disputed integer:=0;
  obligation integer:=0;
  rows jsonb;
BEGIN
  SELECT * INTO decision
  FROM beauty.refund_decisions
  WHERE id=target_decision;

  IF decision.id IS NULL OR decision.status<>'succeeded' THEN
    RETURN;
  END IF;

  SELECT * INTO booking
  FROM beauty.bookings
  WHERE id=decision.booking_id;

  IF booking.id IS NULL OR decision.amount_pence<=0 THEN
    RETURN;
  END IF;

  IF EXISTS(
    SELECT 1 FROM beauty.financial_ledger_transactions
    WHERE event_reference='booking-refund:'||decision.id::text
  ) THEN
    RETURN;
  END IF;

  -- Legacy/non-financial bookings are left unchanged rather than inventing a
  -- professional liability without a matching original ledger transaction.
  IF NOT EXISTS(
    SELECT 1 FROM beauty.financial_ledger_transactions
    WHERE event_reference='booking-payment:'||booking.id::text
  ) THEN
    RETURN;
  END IF;

  SELECT
    greatest(0,coalesce(-sum(e.amount_pence)
      FILTER(WHERE a.code='professional_pending'),0))::integer,
    greatest(0,coalesce(-sum(e.amount_pence)
      FILTER(WHERE a.code='professional_available'),0))::integer,
    greatest(0,coalesce(-sum(e.amount_pence)
      FILTER(WHERE a.code='professional_reserved'),0))::integer,
    greatest(0,coalesce(-sum(e.amount_pence)
      FILTER(WHERE a.code='professional_disputed'),0))::integer
  INTO pending_balance,available_balance,reserved_balance,disputed_balance
  FROM beauty.financial_ledger_accounts a
  LEFT JOIN beauty.financial_ledger_entries e ON e.account_id=a.id
  WHERE a.professional_id=booking.professional_id;

  amount:=decision.amount_pence;
  remaining:=amount;

  use_pending:=least(remaining,pending_balance);
  remaining:=remaining-use_pending;

  use_available:=least(remaining,available_balance);
  remaining:=remaining-use_available;

  use_reserved:=least(remaining,reserved_balance);
  remaining:=remaining-use_reserved;

  use_disputed:=least(remaining,disputed_balance);
  remaining:=remaining-use_disputed;

  obligation:=remaining;

  rows:=jsonb_build_array(
    jsonb_build_object(
      'accountCode','provider_clearing',
      'amountPence',-amount
    )
  );

  IF use_pending>0 THEN
    rows:=rows||jsonb_build_array(jsonb_build_object(
      'accountCode','professional_pending','amountPence',use_pending
    ));
  END IF;
  IF use_available>0 THEN
    rows:=rows||jsonb_build_array(jsonb_build_object(
      'accountCode','professional_available','amountPence',use_available
    ));
  END IF;
  IF use_reserved>0 THEN
    rows:=rows||jsonb_build_array(jsonb_build_object(
      'accountCode','professional_reserved','amountPence',use_reserved
    ));
  END IF;
  IF use_disputed>0 THEN
    rows:=rows||jsonb_build_array(jsonb_build_object(
      'accountCode','professional_disputed','amountPence',use_disputed
    ));
  END IF;
  IF obligation>0 THEN
    rows:=rows||jsonb_build_array(jsonb_build_object(
      'accountCode','professional_outstanding_obligation',
      'amountPence',obligation
    ));
  END IF;

  PERFORM beauty.record_financial_ledger(
    'booking-refund:'||decision.id::text,
    'refund',
    'refund',
    decision.id,
    booking.professional_id,
    jsonb_build_object(
      'bookingId',booking.id,
      'refundPercent',decision.refund_percent,
      'customerRefundPence',amount,
      'professionalRecoveredPence',amount-obligation,
      'professionalObligationPence',obligation,
      'platformFeesPreserved',true
    ),
    rows
  );
END $$;

CREATE OR REPLACE FUNCTION beauty.recover_my_outstanding_obligation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  target uuid;
  available integer:=0;
  obligation integer:=0;
  recovery integer:=0;
BEGIN
  SELECT p.id INTO target
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  IF target IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  PERFORM beauty.ensure_financial_accounts(target);

  SELECT
    greatest(0,coalesce(-sum(e.amount_pence)
      FILTER(WHERE a.code='professional_available'),0))::integer,
    greatest(0,coalesce(sum(e.amount_pence)
      FILTER(WHERE a.code='professional_outstanding_obligation'),0))::integer
  INTO available,obligation
  FROM beauty.financial_ledger_accounts a
  LEFT JOIN beauty.financial_ledger_entries e ON e.account_id=a.id
  WHERE a.professional_id=target;

  recovery:=least(available,obligation);
  IF recovery<=0 THEN RETURN 0; END IF;

  PERFORM beauty.record_financial_ledger(
    'obligation-recovery:'||gen_random_uuid()::text,
    'recovery',
    'admin',
    NULL,
    target,
    jsonb_build_object('automatic',true,'amountPence',recovery),
    jsonb_build_array(
      jsonb_build_object(
        'accountCode','professional_available','amountPence',recovery
      ),
      jsonb_build_object(
        'accountCode','professional_outstanding_obligation',
        'amountPence',-recovery
      )
    )
  );

  RETURN recovery;
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_payment_worker,beauty_financial_worker;
ALTER FUNCTION beauty.record_booking_refund_finance(uuid)
  OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.recover_my_outstanding_obligation()
  OWNER TO beauty_financial_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_payment_worker,beauty_financial_worker;

REVOKE ALL ON FUNCTION
  beauty.record_booking_refund_finance(uuid),
  beauty.recover_my_outstanding_obligation()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION beauty.record_booking_refund_finance(uuid)
TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.recover_my_outstanding_obligation()
TO beauty_app;

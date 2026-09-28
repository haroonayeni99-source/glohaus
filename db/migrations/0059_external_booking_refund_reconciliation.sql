-- Reconcile booking refunds created outside the GLOHAUS refund workflow.
-- Stripe Dashboard refunds do not carry refund_decision_id metadata, so they
-- must be matched to a GLOHAUS booking by the verified Payment Intent.
CREATE TABLE beauty.external_booking_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref text NOT NULL UNIQUE CHECK(provider_ref LIKE 're_%'),
  booking_id uuid NOT NULL,
  payment_intent_id text NOT NULL,
  amount_pence integer NOT NULL CHECK(amount_pence>0),
  status text NOT NULL CHECK(status IN('pending','succeeded','failed','canceled','requires_action')),
  applied_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beauty.external_booking_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.external_booking_refunds FORCE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE ON beauty.external_booking_refunds TO beauty_payment_worker;
CREATE POLICY external_booking_refunds_worker
  ON beauty.external_booking_refunds
  FOR ALL TO beauty_payment_worker
  USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.reconcile_external_booking_refund(
  event_ref_input text,
  provider_ref_input text,
  amount_input integer,
  provider_status_input text,
  intent_ref_input text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  payment beauty.payments;
  external_refund beauty.external_booking_refunds;
  target_professional uuid;
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
  IF provider_ref_input IS NULL OR provider_ref_input NOT LIKE 're_%'
     OR intent_ref_input IS NULL OR amount_input IS NULL OR amount_input<=0
     OR provider_status_input NOT IN('pending','succeeded','failed','canceled','requires_action')
  THEN
    RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
  END IF;

  SELECT * INTO payment
  FROM beauty.payments
  WHERE stripe_payment_intent_id=intent_ref_input
  FOR UPDATE;

  -- Ignore refunds for unrelated Stripe activity when the webhook endpoint is
  -- shared with other provider objects.
  IF payment.booking_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO external_refund
  FROM beauty.external_booking_refunds
  WHERE provider_ref=provider_ref_input
  FOR UPDATE;

  IF external_refund.id IS NULL THEN
    INSERT INTO beauty.external_booking_refunds(
      provider_ref,booking_id,payment_intent_id,amount_pence,status
    ) VALUES(provider_ref_input,payment.booking_id,intent_ref_input,amount_input,provider_status_input)
    RETURNING * INTO external_refund;
  ELSE
    IF external_refund.booking_id IS DISTINCT FROM payment.booking_id
       OR external_refund.payment_intent_id IS DISTINCT FROM intent_ref_input
       OR external_refund.amount_pence IS DISTINCT FROM amount_input
    THEN
      RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
    END IF;
    UPDATE beauty.external_booking_refunds
    SET status=provider_status_input,updated_at=now()
    WHERE id=external_refund.id
    RETURNING * INTO external_refund;
  END IF;

  IF provider_status_input='succeeded' AND external_refund.applied_at IS NULL THEN
    IF payment.refunded_pence+amount_input>payment.captured_pence THEN
      RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
    END IF;

    UPDATE beauty.payments
    SET refunded_pence=refunded_pence+amount_input,
        status=CASE
          WHEN refunded_pence+amount_input=captured_pence THEN 'refunded'
          ELSE 'partially_refunded'
        END,
        updated_at=now()
    WHERE booking_id=payment.booking_id;

    -- Only create recovery accounting when the original booking payment was
    -- already recorded in the GLOHAUS ledger. The original journal entry also
    -- gives us the professional identity without widening this worker's access
    -- to the bookings table.
    SELECT professional_id INTO target_professional
    FROM beauty.financial_ledger_transactions
    WHERE event_reference='booking-payment:'||payment.booking_id::text;

    IF target_professional IS NOT NULL THEN
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
      WHERE a.professional_id=target_professional;

      remaining:=amount_input;
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
        jsonb_build_object('accountCode','provider_clearing','amountPence',-amount)
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
          'accountCode','professional_outstanding_obligation','amountPence',obligation
        ));
      END IF;

      PERFORM beauty.record_financial_ledger(
        'booking-refund-external:'||provider_ref_input,
        'refund',
        'refund',
        external_refund.id,
        target_professional,
        jsonb_build_object(
          'bookingId',payment.booking_id,
          'providerRefundId',provider_ref_input,
          'customerRefundPence',amount_input,
          'professionalRecoveredPence',amount_input-obligation,
          'professionalObligationPence',obligation,
          'platformFeesPreserved',true,
          'source','stripe_dashboard_or_external'
        ),
        rows
      );
    END IF;

    UPDATE beauty.external_booking_refunds
    SET applied_at=now(),updated_at=now()
    WHERE id=external_refund.id;
  END IF;

  INSERT INTO beauty.payment_events(event_id)
  VALUES(event_ref_input)
  ON CONFLICT DO NOTHING;

  RETURN external_refund.id;
END
$fn$;

GRANT CREATE ON SCHEMA beauty TO beauty_payment_worker;
ALTER FUNCTION beauty.reconcile_external_booking_refund(text,text,integer,text,text)
  OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_payment_worker;
REVOKE ALL ON FUNCTION beauty.reconcile_external_booking_refund(text,text,integer,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.reconcile_external_booking_refund(text,text,integer,text,text)
  TO beauty_payment_worker;

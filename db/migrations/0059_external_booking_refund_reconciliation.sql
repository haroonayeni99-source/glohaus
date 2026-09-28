-- Reconcile booking refunds created outside the GLOHAUS refund workflow.
-- Stripe Dashboard refunds do not carry refund_decision_id metadata, so they
-- must be matched to a GLOHAUS booking by the verified Payment Intent.
CREATE TABLE beauty.external_booking_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref text NOT NULL UNIQUE CHECK(provider_ref LIKE 're_%'),
  booking_id uuid NOT NULL REFERENCES beauty.bookings(id),
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
  event_ref text,
  provider_ref text,
  amount integer,
  provider_status text,
  intent_ref text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  payment beauty.payments;
  booking beauty.bookings;
  external_refund beauty.external_booking_refunds;
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
  IF provider_ref IS NULL OR provider_ref NOT LIKE 're_%'
     OR intent_ref IS NULL OR amount IS NULL OR amount<=0
     OR provider_status NOT IN('pending','succeeded','failed','canceled','requires_action')
  THEN
    RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
  END IF;

  SELECT * INTO payment
  FROM beauty.payments
  WHERE stripe_payment_intent_id=intent_ref
  FOR UPDATE;

  -- Ignore refunds for unrelated Stripe activity when the webhook endpoint is
  -- shared with other provider objects.
  IF payment.booking_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO booking
  FROM beauty.bookings
  WHERE id=payment.booking_id
  FOR UPDATE;

  SELECT * INTO external_refund
  FROM beauty.external_booking_refunds
  WHERE provider_ref=reconcile_external_booking_refund.provider_ref
  FOR UPDATE;

  IF external_refund.id IS NULL THEN
    INSERT INTO beauty.external_booking_refunds(
      provider_ref,booking_id,payment_intent_id,amount_pence,status
    ) VALUES(provider_ref,booking.id,intent_ref,amount,provider_status)
    RETURNING * INTO external_refund;
  ELSE
    IF external_refund.booking_id IS DISTINCT FROM booking.id
       OR external_refund.payment_intent_id IS DISTINCT FROM intent_ref
       OR external_refund.amount_pence IS DISTINCT FROM amount
    THEN
      RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
    END IF;
    UPDATE beauty.external_booking_refunds
    SET status=provider_status,updated_at=now()
    WHERE id=external_refund.id
    RETURNING * INTO external_refund;
  END IF;

  IF provider_status='succeeded' AND external_refund.applied_at IS NULL THEN
    IF payment.refunded_pence+amount>payment.captured_pence THEN
      RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
    END IF;

    UPDATE beauty.payments
    SET refunded_pence=refunded_pence+amount,
        status=CASE
          WHEN refunded_pence+amount=captured_pence THEN 'refunded'
          ELSE 'partially_refunded'
        END,
        updated_at=now()
    WHERE booking_id=booking.id;

    -- Only create recovery accounting when the original booking payment was
    -- already recorded in the GLOHAUS ledger. Legacy bookings remain accurate
    -- in payment state without inventing historical journal entries.
    IF EXISTS(
      SELECT 1 FROM beauty.financial_ledger_transactions
      WHERE event_reference='booking-payment:'||booking.id::text
    ) THEN
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
        'booking-refund-external:'||provider_ref,
        'refund',
        'refund',
        external_refund.id,
        booking.professional_id,
        jsonb_build_object(
          'bookingId',booking.id,
          'providerRefundId',provider_ref,
          'customerRefundPence',amount,
          'professionalRecoveredPence',amount-obligation,
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
  VALUES(event_ref)
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

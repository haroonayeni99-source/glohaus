-- Reconcile booking refunds initiated outside GLOHAUS (for example in Stripe Dashboard).
-- Keeps provider events distinct from in-app refund decisions while preserving
-- the same professional-balance recovery and platform-fee protection rules.

CREATE TABLE beauty.external_booking_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES beauty.bookings(id),
  stripe_refund_id text NOT NULL UNIQUE CHECK (stripe_refund_id LIKE 're_%'),
  stripe_payment_intent_id text NOT NULL,
  amount_pence integer NOT NULL CHECK (amount_pence > 0),
  provider_status text NOT NULL CHECK (provider_status IN ('pending','requires_action','succeeded','failed','canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX external_booking_refunds_booking_idx
  ON beauty.external_booking_refunds(booking_id, created_at DESC);

ALTER TABLE beauty.external_booking_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.external_booking_refunds FORCE ROW LEVEL SECURITY;

CREATE POLICY external_booking_refunds_payment_worker
  ON beauty.external_booking_refunds
  FOR ALL
  TO beauty_payment_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY external_booking_refunds_admin_read
  ON beauty.external_booking_refunds
  FOR SELECT
  TO beauty_admin_ops
  USING (true);

GRANT SELECT,INSERT,UPDATE ON beauty.external_booking_refunds TO beauty_payment_worker;
GRANT SELECT ON beauty.external_booking_refunds TO beauty_admin_ops;
GRANT SELECT,INSERT ON beauty.payment_events TO beauty_payment_worker;

CREATE FUNCTION beauty.reconcile_external_booking_refund(
  event_ref text,
  provider_ref text,
  amount integer,
  provider_status text,
  intent_ref text
) RETURNS void
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
  IF event_ref IS NULL OR length(trim(event_ref)) NOT BETWEEN 1 AND 200
     OR provider_ref IS NULL OR provider_ref NOT LIKE 're_%'
     OR intent_ref IS NULL
     OR amount IS NULL OR amount<=0
     OR provider_status NOT IN ('pending','requires_action','succeeded','failed','canceled')
  THEN
    RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
  END IF;

  IF EXISTS(SELECT 1 FROM beauty.payment_events WHERE event_id=event_ref) THEN
    RETURN;
  END IF;

  SELECT p.* INTO payment
  FROM beauty.payments p
  WHERE p.stripe_payment_intent_id=intent_ref
  FOR UPDATE;

  IF payment.booking_id IS NULL THEN
    -- Not a GLOHAUS booking payment; acknowledge the event without mutating data.
    INSERT INTO beauty.payment_events(event_id) VALUES(event_ref)
    ON CONFLICT DO NOTHING;
    RETURN;
  END IF;

  SELECT b.* INTO booking
  FROM beauty.bookings b
  WHERE b.id=payment.booking_id
  FOR UPDATE;

  SELECT * INTO external_refund
  FROM beauty.external_booking_refunds
  WHERE stripe_refund_id=provider_ref
  FOR UPDATE;

  IF external_refund.id IS NULL THEN
    INSERT INTO beauty.external_booking_refunds(
      booking_id,stripe_refund_id,stripe_payment_intent_id,amount_pence,provider_status
    ) VALUES(
      booking.id,provider_ref,intent_ref,amount,provider_status
    )
    RETURNING * INTO external_refund;
  ELSE
    IF external_refund.booking_id IS DISTINCT FROM booking.id
       OR external_refund.stripe_payment_intent_id IS DISTINCT FROM intent_ref
       OR external_refund.amount_pence IS DISTINCT FROM amount
    THEN
      RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';
    END IF;

    IF external_refund.provider_status='succeeded' THEN
      INSERT INTO beauty.payment_events(event_id) VALUES(event_ref)
      ON CONFLICT DO NOTHING;
      RETURN;
    END IF;

    UPDATE beauty.external_booking_refunds
    SET provider_status=provider_status,updated_at=now()
    WHERE id=external_refund.id;
  END IF;

  IF provider_status='succeeded' THEN
    IF amount > payment.captured_pence-payment.refunded_pence THEN
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

    -- Legacy bookings without a recorded financial transaction are reconciled
    -- at the payment layer only; do not invent a professional liability.
    IF EXISTS(
      SELECT 1
      FROM beauty.financial_ledger_transactions
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
        'booking-external-refund:'||provider_ref,
        'refund',
        'refund',
        external_refund.id,
        booking.professional_id,
        jsonb_build_object(
          'bookingId',booking.id,
          'stripeRefundId',provider_ref,
          'customerRefundPence',amount,
          'professionalRecoveredPence',amount-obligation,
          'professionalObligationPence',obligation,
          'platformFeesPreserved',true,
          'externalProviderRefund',true
        ),
        rows
      );
    END IF;
  END IF;

  INSERT INTO beauty.payment_events(event_id) VALUES(event_ref)
  ON CONFLICT DO NOTHING;
END;
$fn$;

GRANT CREATE ON SCHEMA beauty TO beauty_payment_worker;
ALTER FUNCTION beauty.reconcile_external_booking_refund(text,text,integer,text,text)
  OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_payment_worker;

REVOKE ALL ON FUNCTION
  beauty.reconcile_external_booking_refund(text,text,integer,text,text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  beauty.reconcile_external_booking_refund(text,text,integer,text,text)
TO beauty_payment_worker;

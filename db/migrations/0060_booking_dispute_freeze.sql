-- Record Stripe booking disputes and immediately freeze professional withdrawals.
-- This migration intentionally avoids automatic chargeback ledger movement; the
-- first safety response is to prevent additional payouts while the dispute is open.

CREATE TABLE beauty.booking_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES beauty.bookings(id),
  stripe_dispute_id text NOT NULL UNIQUE CHECK (stripe_dispute_id LIKE 'dp_%'),
  stripe_payment_intent_id text NOT NULL,
  amount_pence integer NOT NULL CHECK (amount_pence > 0),
  currency text NOT NULL CHECK (currency='gbp'),
  status text NOT NULL CHECK (status IN (
    'warning_needs_response','warning_under_review','warning_closed',
    'needs_response','under_review','won','lost'
  )),
  reason text,
  evidence_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_disputes_booking_idx
  ON beauty.booking_disputes(booking_id, created_at DESC);

ALTER TABLE beauty.booking_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.booking_disputes FORCE ROW LEVEL SECURITY;

CREATE POLICY booking_disputes_payment_worker
  ON beauty.booking_disputes
  FOR ALL TO beauty_payment_worker
  USING (true) WITH CHECK (true);

CREATE POLICY booking_disputes_admin_read
  ON beauty.booking_disputes
  FOR SELECT TO beauty_admin_ops
  USING (true);

GRANT SELECT,INSERT,UPDATE ON beauty.booking_disputes TO beauty_payment_worker;
GRANT SELECT ON beauty.booking_disputes TO beauty_admin_ops;
GRANT SELECT,INSERT ON beauty.payment_events TO beauty_payment_worker;
GRANT SELECT,UPDATE ON beauty.professional_financial_controls TO beauty_payment_worker;

CREATE POLICY dispute_worker_financial_controls
  ON beauty.professional_financial_controls
  FOR ALL TO beauty_payment_worker
  USING (true) WITH CHECK (true);

CREATE FUNCTION beauty.sync_booking_dispute(
  event_ref text,
  dispute_ref text,
  intent_ref text,
  amount integer,
  currency_code text,
  dispute_status text,
  dispute_reason text,
  evidence_due bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  payment beauty.payments;
  booking beauty.bookings;
  dispute beauty.booking_disputes;
  has_open boolean;
BEGIN
  IF event_ref IS NULL OR length(trim(event_ref)) NOT BETWEEN 1 AND 200
     OR dispute_ref IS NULL OR dispute_ref NOT LIKE 'dp_%'
     OR intent_ref IS NULL
     OR amount IS NULL OR amount<=0
     OR currency_code IS DISTINCT FROM 'gbp'
     OR dispute_status NOT IN (
       'warning_needs_response','warning_under_review','warning_closed',
       'needs_response','under_review','won','lost'
     )
  THEN
    RAISE EXCEPTION 'DISPUTE_MISMATCH' USING ERRCODE='22023';
  END IF;

  IF EXISTS(SELECT 1 FROM beauty.payment_events WHERE event_id=event_ref) THEN
    RETURN;
  END IF;

  SELECT p.* INTO payment
  FROM beauty.payments p
  WHERE p.stripe_payment_intent_id=intent_ref
  FOR UPDATE;

  IF payment.booking_id IS NULL THEN
    INSERT INTO beauty.payment_events(event_id) VALUES(event_ref)
    ON CONFLICT DO NOTHING;
    RETURN;
  END IF;

  SELECT b.* INTO booking
  FROM beauty.bookings b
  WHERE b.id=payment.booking_id
  FOR UPDATE;

  SELECT * INTO dispute
  FROM beauty.booking_disputes
  WHERE stripe_dispute_id=dispute_ref
  FOR UPDATE;

  IF dispute.id IS NULL THEN
    INSERT INTO beauty.booking_disputes(
      booking_id,stripe_dispute_id,stripe_payment_intent_id,
      amount_pence,currency,status,reason,evidence_due_at
    ) VALUES(
      booking.id,dispute_ref,intent_ref,amount,currency_code,dispute_status,
      nullif(trim(coalesce(dispute_reason,'')),''),
      CASE WHEN evidence_due IS NULL THEN NULL ELSE to_timestamp(evidence_due) END
    );
  ELSE
    IF dispute.booking_id IS DISTINCT FROM booking.id
       OR dispute.stripe_payment_intent_id IS DISTINCT FROM intent_ref
       OR dispute.amount_pence IS DISTINCT FROM amount
       OR dispute.currency IS DISTINCT FROM currency_code
    THEN
      RAISE EXCEPTION 'DISPUTE_MISMATCH' USING ERRCODE='22023';
    END IF;

    UPDATE beauty.booking_disputes
    SET status=dispute_status,
        reason=nullif(trim(coalesce(dispute_reason,'')),''),
        evidence_due_at=CASE
          WHEN evidence_due IS NULL THEN evidence_due_at
          ELSE to_timestamp(evidence_due)
        END,
        updated_at=now()
    WHERE stripe_dispute_id=dispute_ref;
  END IF;

  INSERT INTO beauty.professional_financial_controls(professional_id)
  VALUES(booking.professional_id)
  ON CONFLICT DO NOTHING;

  IF dispute_status IN (
    'warning_needs_response','warning_under_review','needs_response','under_review'
  ) THEN
    UPDATE beauty.professional_financial_controls
    SET withdrawals_blocked=true,
        instant_payout_blocked=true,
        review_status='under_review',
        updated_at=now()
    WHERE professional_id=booking.professional_id;
  ELSE
    SELECT EXISTS(
      SELECT 1
      FROM beauty.booking_disputes d
      JOIN beauty.bookings b ON b.id=d.booking_id
      WHERE b.professional_id=booking.professional_id
        AND d.stripe_dispute_id<>dispute_ref
        AND d.status IN (
          'warning_needs_response','warning_under_review','needs_response','under_review'
        )
    ) INTO has_open;

    IF NOT has_open AND dispute_status IN ('won','warning_closed') THEN
      UPDATE beauty.professional_financial_controls
      SET withdrawals_blocked=false,
          instant_payout_blocked=false,
          review_status='clear',
          updated_at=now()
      WHERE professional_id=booking.professional_id
        AND review_status='under_review';
    ELSIF dispute_status='lost' THEN
      UPDATE beauty.professional_financial_controls
      SET withdrawals_blocked=true,
          instant_payout_blocked=true,
          review_status='restricted',
          updated_at=now()
      WHERE professional_id=booking.professional_id;
    END IF;
  END IF;

  INSERT INTO beauty.payment_events(event_id) VALUES(event_ref)
  ON CONFLICT DO NOTHING;
END;
$fn$;

GRANT CREATE ON SCHEMA beauty TO beauty_payment_worker;
ALTER FUNCTION beauty.sync_booking_dispute(text,text,text,integer,text,text,text,bigint)
  OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_payment_worker;

REVOKE ALL ON FUNCTION
  beauty.sync_booking_dispute(text,text,text,integer,text,text,text,bigint)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  beauty.sync_booking_dispute(text,text,text,integer,text,text,text,bigint)
TO beauty_payment_worker;

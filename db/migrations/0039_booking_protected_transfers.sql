-- Protect service-deposit proceeds using the same platform-charge and delayed
-- transfer model as Shop. Paid booking deposits remain on GLOHAUS until the
-- completed-service protection window has passed.

ALTER TABLE beauty.payments
  ADD COLUMN stripe_transfer_id text UNIQUE,
  ADD COLUMN transferred_at timestamptz;

GRANT SELECT ON beauty.bookings,beauty.payments TO beauty_financial_worker;
CREATE POLICY finance_worker_bookings ON beauty.bookings
FOR SELECT TO beauty_financial_worker USING(true);
CREATE POLICY finance_worker_payments ON beauty.payments
FOR SELECT TO beauty_financial_worker USING(true);

GRANT SELECT ON beauty.financial_quotes TO beauty_payment_worker;
GRANT SELECT ON beauty.bookings TO beauty_payment_worker;
GRANT SELECT,UPDATE ON beauty.payments TO beauty_payment_worker;
CREATE POLICY booking_finance_worker_quotes ON beauty.financial_quotes
FOR SELECT TO beauty_payment_worker USING(true);
CREATE POLICY booking_finance_worker_bookings ON beauty.bookings
FOR SELECT TO beauty_payment_worker USING(true);
CREATE POLICY booking_finance_worker_payments ON beauty.payments
FOR ALL TO beauty_payment_worker USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.prepare_booking_financial_quote(target uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE actor uuid; booking beauty.bookings; fee beauty.financial_fee_rules;
DECLARE professional_fee integer:=0; quote beauty.financial_quotes;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  SELECT * INTO booking
  FROM beauty.bookings
  WHERE id=target;

  IF actor IS NULL OR booking.id IS NULL OR booking.customer_id<>actor
    OR booking.status<>'payment_pending'
    OR booking.hold_expires_at<=now()
    OR booking.deposit_pence<=0 THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO quote FROM beauty.financial_quotes WHERE booking_id=target;
  IF quote.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id',quote.id,
      'customerTotalPence',quote.customer_total_pence,
      'professionalProceedsPence',quote.professional_proceeds_pence,
      'professionalPlatformFeePence',quote.professional_platform_fee_pence
    );
  END IF;

  SELECT * INTO fee
  FROM beauty.financial_fee_rules
  WHERE transaction_kind='booking'
    AND category_key IS NULL
    AND fee_payer='professional'
    AND active
    AND effective_from<=now()
    AND (effective_until IS NULL OR effective_until>now())
  ORDER BY effective_from DESC,id DESC
  LIMIT 1;

  IF fee.id IS NOT NULL THEN
    professional_fee :=
      (booking.deposit_pence * fee.percentage_basis_points) / 10000
      + fee.fixed_fee_pence;
    professional_fee:=greatest(professional_fee,fee.minimum_fee_pence);
    IF fee.maximum_fee_pence IS NOT NULL THEN
      professional_fee:=least(professional_fee,fee.maximum_fee_pence);
    END IF;
    professional_fee:=least(professional_fee,booking.deposit_pence);
  END IF;

  INSERT INTO beauty.financial_quotes(
    booking_id,fee_rule_id,service_value_pence,payable_now_pence,
    customer_platform_fee_pence,professional_platform_fee_pence,
    estimated_provider_cost_pence,professional_processing_cost_pence,
    customer_total_pence,professional_proceeds_pence,
    platform_gross_revenue_pence,platform_net_revenue_pence
  ) VALUES(
    booking.id,fee.id,booking.price_pence,booking.deposit_pence,
    0,professional_fee,
    0,0,
    booking.deposit_pence,booking.deposit_pence-professional_fee,
    professional_fee,professional_fee
  )
  RETURNING * INTO quote;

  RETURN jsonb_build_object(
    'id',quote.id,
    'customerTotalPence',quote.customer_total_pence,
    'professionalProceedsPence',quote.professional_proceeds_pence,
    'professionalPlatformFeePence',quote.professional_platform_fee_pence
  );
END $$;

CREATE FUNCTION beauty.record_booking_payment_finance(
  target uuid,
  intent_ref text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE booking beauty.bookings; payment beauty.payments; quote beauty.financial_quotes;
BEGIN
  SELECT * INTO booking FROM beauty.bookings WHERE id=target;
  SELECT * INTO payment FROM beauty.payments WHERE booking_id=target;
  SELECT * INTO quote FROM beauty.financial_quotes WHERE booking_id=target;

  IF booking.id IS NULL OR payment.booking_id IS NULL OR quote.id IS NULL
    OR payment.status<>'paid'
    OR payment.stripe_payment_intent_id IS DISTINCT FROM intent_ref
    OR payment.captured_pence<>quote.customer_total_pence THEN
    RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE='22023';
  END IF;

  IF quote.professional_proceeds_pence<=0 AND quote.professional_platform_fee_pence<=0 THEN
    RETURN;
  END IF;

  PERFORM beauty.record_financial_ledger(
    'booking-payment:'||booking.id::text,
    'proceeds_pending',
    'booking',
    booking.id,
    booking.professional_id,
    jsonb_build_object(
      'paymentIntentId',intent_ref,
      'financialQuoteId',quote.id,
      'platformFeePence',quote.professional_platform_fee_pence
    ),
    CASE
      WHEN quote.professional_platform_fee_pence>0 THEN jsonb_build_array(
        jsonb_build_object('accountCode','provider_clearing','amountPence',payment.captured_pence),
        jsonb_build_object('accountCode','platform_fee_revenue','amountPence',-quote.professional_platform_fee_pence),
        jsonb_build_object('accountCode','professional_pending','amountPence',-quote.professional_proceeds_pence)
      )
      ELSE jsonb_build_array(
        jsonb_build_object('accountCode','provider_clearing','amountPence',payment.captured_pence),
        jsonb_build_object('accountCode','professional_pending','amountPence',-quote.professional_proceeds_pence)
      )
    END
  );
END $$;

CREATE FUNCTION beauty.release_my_mature_booking_proceeds() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE target_professional uuid; target_booking record; released_count integer:=0;
BEGIN
  SELECT p.id INTO target_professional
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  IF target_professional IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  FOR target_booking IN
    SELECT b.id,q.professional_proceeds_pence,b.completed_at
    FROM beauty.bookings b
    JOIN beauty.payments p ON p.booking_id=b.id
    JOIN beauty.financial_quotes q ON q.booking_id=b.id
    WHERE b.professional_id=target_professional
      AND b.status='completed'
      AND b.completed_at IS NOT NULL
      AND b.completed_at<=now()-interval '24 hours'
      AND p.status='paid'
      AND p.refunded_pence=0
      AND q.professional_proceeds_pence>0
      AND EXISTS(
        SELECT 1 FROM beauty.financial_ledger_transactions t
        WHERE t.event_reference='booking-payment:'||b.id::text
      )
      AND NOT EXISTS(
        SELECT 1 FROM beauty.financial_ledger_transactions t
        WHERE t.event_reference='booking-release:'||b.id::text
      )
    ORDER BY b.completed_at,b.id
  LOOP
    PERFORM beauty.record_financial_ledger(
      'booking-release:'||target_booking.id::text,
      'release',
      'booking',
      target_booking.id,
      target_professional,
      jsonb_build_object(
        'releasePolicy','completed_plus_24h',
        'completedAt',target_booking.completed_at
      ),
      jsonb_build_array(
        jsonb_build_object(
          'accountCode','professional_pending',
          'amountPence',target_booking.professional_proceeds_pence
        ),
        jsonb_build_object(
          'accountCode','professional_available',
          'amountPence',-target_booking.professional_proceeds_pence
        )
      )
    );
    released_count:=released_count+1;
  END LOOP;

  RETURN released_count;
END $$;

CREATE FUNCTION beauty.record_booking_transfer(
  target uuid,
  transfer_ref text,
  amount integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE booking beauty.bookings; payment beauty.payments; quote beauty.financial_quotes;
BEGIN
  IF length(trim(coalesce(transfer_ref,'')))<3 OR amount IS NULL OR amount<=0 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT * INTO booking FROM beauty.bookings WHERE id=target;
  SELECT * INTO payment FROM beauty.payments WHERE booking_id=target FOR UPDATE;
  SELECT * INTO quote FROM beauty.financial_quotes WHERE booking_id=target;

  IF booking.id IS NULL OR payment.booking_id IS NULL OR quote.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';
  END IF;

  IF payment.stripe_transfer_id IS NOT NULL THEN
    IF payment.stripe_transfer_id IS DISTINCT FROM transfer_ref THEN
      RAISE EXCEPTION 'TRANSFER_MISMATCH' USING ERRCODE='22023';
    END IF;
    RETURN;
  END IF;

  IF booking.status<>'completed'
    OR booking.completed_at IS NULL
    OR booking.completed_at>now()-interval '24 hours'
    OR payment.status<>'paid'
    OR payment.refunded_pence<>0
    OR quote.professional_proceeds_pence<>amount
    OR NOT EXISTS(
      SELECT 1 FROM beauty.financial_ledger_transactions t
      WHERE t.event_reference='booking-release:'||booking.id::text
        AND t.kind='release'
        AND t.reference_type='booking'
        AND t.reference_id=booking.id
        AND t.professional_id=booking.professional_id
    ) THEN
    RAISE EXCEPTION 'TRANSFER_NOT_READY' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.payments
  SET stripe_transfer_id=trim(transfer_ref),
      transferred_at=now(),
      updated_at=now()
  WHERE booking_id=target;

  PERFORM beauty.record_financial_ledger(
    'booking-transfer:'||booking.id::text,
    'payout',
    'booking',
    booking.id,
    booking.professional_id,
    jsonb_build_object('stripeTransferId',trim(transfer_ref)),
    jsonb_build_array(
      jsonb_build_object(
        'accountCode','professional_available',
        'amountPence',amount
      ),
      jsonb_build_object(
        'accountCode','provider_clearing',
        'amountPence',-amount
      )
    )
  );
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_financial_worker,beauty_payment_worker;
ALTER FUNCTION beauty.prepare_booking_financial_quote(uuid) OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.release_my_mature_booking_proceeds() OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.record_booking_payment_finance(uuid,text) OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.record_booking_transfer(uuid,text,integer) OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_financial_worker,beauty_payment_worker;

REVOKE ALL ON FUNCTION
  beauty.prepare_booking_financial_quote(uuid),
  beauty.release_my_mature_booking_proceeds(),
  beauty.record_booking_payment_finance(uuid,text),
  beauty.record_booking_transfer(uuid,text,integer)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  beauty.prepare_booking_financial_quote(uuid),
  beauty.release_my_mature_booking_proceeds()
TO beauty_app;

GRANT EXECUTE ON FUNCTION
  beauty.record_booking_payment_finance(uuid,text),
  beauty.record_booking_transfer(uuid,text,integer)
TO beauty_payment_worker;

-- Apply the £1 customer booking fee to the actual booking quote and preserve
-- professional plan commission snapshots without exposing them to customers.

ALTER TABLE beauty.financial_quotes
  DROP CONSTRAINT IF EXISTS financial_quotes_payable_now_pence_check,
  ADD CONSTRAINT financial_quotes_payable_now_pence_check
    CHECK(payable_now_pence>=0 AND payable_now_pence<=service_value_pence),
  ADD COLUMN pricing_plan_key text,
  ADD COLUMN professional_commission_basis_points integer
    CHECK(professional_commission_basis_points IS NULL OR professional_commission_basis_points BETWEEN 0 AND 10000),
  ADD COLUMN professional_commission_total_pence integer NOT NULL DEFAULT 0
    CHECK(professional_commission_total_pence>=0),
  ADD COLUMN professional_commission_deferred_pence integer NOT NULL DEFAULT 0
    CHECK(professional_commission_deferred_pence>=0);

CREATE OR REPLACE FUNCTION beauty.reserve_booking(
  target_service uuid,
  target_start timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  customer beauty.users;
  service beauty.services;
  professional beauty.professional_profiles;
  finish timestamptz;
  local_start timestamp;
  local_end timestamp;
  rule beauty.availability_rules;
  result beauty.bookings;
  instant timestamptz;
  booking_fee integer:=beauty.public_booking_fee_pence();
BEGIN
  SELECT u.* INTO customer
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active'
    AND r.role='customer';

  IF customer.id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO service FROM beauty.services WHERE id=target_service AND active;
  SELECT p.* INTO professional
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  WHERE p.id=service.professional_id
    AND p.publication_status='published'
    AND u.status='active';

  IF professional.id IS NULL OR professional.user_id=customer.id THEN
    RAISE EXCEPTION 'UNAVAILABLE_SERVICE' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM beauty.professional_payment_accounts
    WHERE professional_id=professional.id AND charges_enabled
  ) THEN
    RAISE EXCEPTION 'PAYMENTS_NOT_READY' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(professional.id::text,0));

  IF target_start IS NULL
    OR target_start<now()+interval '1 hour'
    OR target_start>now()+interval '90 days'
    OR extract(epoch FROM target_start)%900<>0 THEN
    RAISE EXCEPTION 'INVALID_TIME' USING ERRCODE='22023';
  END IF;

  finish:=target_start+service.duration_minutes*interval '1 minute';
  local_start:=target_start AT TIME ZONE 'Europe/London';
  local_end:=finish AT TIME ZONE 'Europe/London';

  SELECT * INTO rule
  FROM beauty.availability_rules
  WHERE professional_id=professional.id
    AND weekday=extract(dow FROM local_start);

  IF rule.id IS NULL OR (
    local_end::date<>local_start::date
    AND NOT(
      local_end::date=local_start::date+1
      AND local_end::time='00:00'
      AND rule.end_minute=1440
    )
  ) THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS' USING ERRCODE='22023';
  END IF;

  FOR instant IN
    SELECT generate_series(
      target_start,
      finish-interval '1 second',
      interval '15 minutes'
    )
  LOOP
    IF extract(hour FROM instant AT TIME ZONE 'Europe/London')*60
      + extract(minute FROM instant AT TIME ZONE 'Europe/London')
      NOT BETWEEN rule.start_minute AND rule.end_minute-1 THEN
      RAISE EXCEPTION 'OUTSIDE_HOURS' USING ERRCODE='22023';
    END IF;
  END LOOP;

  IF local_end::date=local_start::date
    AND extract(hour FROM local_end)*60+extract(minute FROM local_end)>rule.end_minute THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.bookings
  SET status='expired'
  WHERE professional_id=professional.id
    AND status='payment_pending'
    AND hold_expires_at<=now();

  SELECT * INTO result
  FROM beauty.bookings
  WHERE professional_id=professional.id
    AND customer_id=customer.id
    AND service_id=service.id
    AND starts_at=target_start
    AND status='payment_pending'
    AND hold_expires_at>now()
  LIMIT 1;

  IF result.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id',result.id,
      'depositPence',result.deposit_pence,
      'bookingFeePence',booking_fee,
      'serviceName',result.service_name,
      'professionalName',result.professional_name,
      'status',result.status,
      'holdExpiresAt',result.hold_expires_at
    );
  END IF;

  IF EXISTS(
    SELECT 1 FROM beauty.bookings
    WHERE professional_id=professional.id
      AND status IN('confirmed','payment_pending')
      AND starts_at<finish
      AND ends_at>target_start
  ) OR EXISTS(
    SELECT 1 FROM beauty.availability_blocks
    WHERE professional_id=professional.id
      AND starts_at<finish
      AND ends_at>target_start
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE='23P01';
  END IF;

  IF (
    SELECT count(*)
    FROM beauty.bookings
    WHERE customer_id=customer.id
      AND created_at>now()-interval '1 hour'
  )>=10 THEN
    RAISE EXCEPTION 'TOO_MANY_ATTEMPTS' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.bookings(
    professional_id,customer_id,service_id,service_name,customer_name,
    professional_name,starts_at,ends_at,duration_minutes,price_pence,
    deposit_pence,status,hold_expires_at
  ) VALUES(
    professional.id,customer.id,service.id,service.name,customer.display_name,
    professional.business_name,target_start,finish,service.duration_minutes,
    service.price_pence,service.deposit_pence,'payment_pending',
    now()+interval '35 minutes'
  )
  RETURNING * INTO result;

  INSERT INTO beauty.payments(booking_id,status)
  VALUES(result.id,'pending');

  RETURN jsonb_build_object(
    'id',result.id,
    'depositPence',result.deposit_pence,
    'bookingFeePence',booking_fee,
    'serviceName',result.service_name,
    'professionalName',result.professional_name,
    'status',result.status,
    'holdExpiresAt',result.hold_expires_at
  );
END $$;

CREATE OR REPLACE FUNCTION beauty.prepare_booking_financial_quote(target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor uuid;
  booking beauty.bookings;
  quote beauty.financial_quotes;
  booking_fee integer:=beauty.public_booking_fee_pence();
  commission_bps integer;
  commission_total integer;
  commission_collected integer;
  plan_key text;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  SELECT * INTO booking FROM beauty.bookings WHERE id=target;

  IF actor IS NULL
    OR booking.id IS NULL
    OR booking.customer_id<>actor
    OR booking.status<>'payment_pending'
    OR booking.hold_expires_at<=now() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO quote
  FROM beauty.financial_quotes
  WHERE booking_id=target;

  IF quote.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id',quote.id,
      'customerTotalPence',quote.customer_total_pence,
      'customerPlatformFeePence',quote.customer_platform_fee_pence,
      'professionalProceedsPence',quote.professional_proceeds_pence,
      'professionalPlatformFeePence',quote.professional_platform_fee_pence
    );
  END IF;

  SELECT coalesce(s.plan_key,'starter') INTO plan_key
  FROM beauty.professional_profiles p
  LEFT JOIN beauty.professional_subscriptions s
    ON s.professional_id=p.id AND s.status='active'
  WHERE p.id=booking.professional_id;

  plan_key:=coalesce(plan_key,'starter');
  commission_bps:=beauty.professional_service_commission_basis_points(
    booking.professional_id
  );
  commission_total:=round(
    booking.price_pence*commission_bps/10000.0
  )::integer;
  commission_collected:=least(
    commission_total,
    booking.deposit_pence
  );

  INSERT INTO beauty.financial_quotes(
    booking_id,fee_rule_id,service_value_pence,payable_now_pence,
    customer_platform_fee_pence,professional_platform_fee_pence,
    estimated_provider_cost_pence,professional_processing_cost_pence,
    customer_total_pence,professional_proceeds_pence,
    platform_gross_revenue_pence,platform_net_revenue_pence,
    pricing_plan_key,professional_commission_basis_points,
    professional_commission_total_pence,
    professional_commission_deferred_pence
  ) VALUES(
    booking.id,NULL,booking.price_pence,booking.deposit_pence,
    booking_fee,commission_collected,
    0,0,
    booking.deposit_pence+booking_fee,
    booking.deposit_pence-commission_collected,
    booking_fee+commission_collected,
    booking_fee+commission_collected,
    plan_key,commission_bps,commission_total,
    commission_total-commission_collected
  )
  RETURNING * INTO quote;

  RETURN jsonb_build_object(
    'id',quote.id,
    'customerTotalPence',quote.customer_total_pence,
    'customerPlatformFeePence',quote.customer_platform_fee_pence,
    'professionalProceedsPence',quote.professional_proceeds_pence,
    'professionalPlatformFeePence',quote.professional_platform_fee_pence
  );
END $$;

CREATE OR REPLACE FUNCTION beauty.record_booking_payment_finance(
  target uuid,
  intent_ref text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  booking beauty.bookings;
  payment beauty.payments;
  quote beauty.financial_quotes;
  platform_fee_total integer;
BEGIN
  SELECT * INTO booking FROM beauty.bookings WHERE id=target;
  SELECT * INTO payment FROM beauty.payments WHERE booking_id=target;
  SELECT * INTO quote FROM beauty.financial_quotes WHERE booking_id=target;

  IF booking.id IS NULL
    OR payment.booking_id IS NULL
    OR quote.id IS NULL
    OR payment.status<>'paid'
    OR payment.stripe_payment_intent_id IS DISTINCT FROM intent_ref
    OR payment.captured_pence<>quote.customer_total_pence THEN
    RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE='22023';
  END IF;

  platform_fee_total:=
    quote.customer_platform_fee_pence
    + quote.professional_platform_fee_pence;

  IF quote.professional_proceeds_pence>0 THEN
    PERFORM beauty.record_financial_ledger(
      'booking-payment:'||booking.id::text,
      'proceeds_pending',
      'booking',
      booking.id,
      booking.professional_id,
      jsonb_build_object(
        'paymentIntentId',intent_ref,
        'financialQuoteId',quote.id,
        'customerBookingFeePence',quote.customer_platform_fee_pence,
        'professionalCommissionPence',quote.professional_platform_fee_pence,
        'professionalCommissionBasisPoints',
          quote.professional_commission_basis_points,
        'pricingPlan',quote.pricing_plan_key
      ),
      CASE
        WHEN platform_fee_total>0 THEN jsonb_build_array(
          jsonb_build_object(
            'accountCode','provider_clearing',
            'amountPence',payment.captured_pence
          ),
          jsonb_build_object(
            'accountCode','platform_fee_revenue',
            'amountPence',-platform_fee_total
          ),
          jsonb_build_object(
            'accountCode','professional_pending',
            'amountPence',-quote.professional_proceeds_pence
          )
        )
        ELSE jsonb_build_array(
          jsonb_build_object(
            'accountCode','provider_clearing',
            'amountPence',payment.captured_pence
          ),
          jsonb_build_object(
            'accountCode','professional_pending',
            'amountPence',-quote.professional_proceeds_pence
          )
        )
      END
    );
  ELSE
    PERFORM beauty.record_financial_ledger(
      'booking-payment:'||booking.id::text,
      'payment',
      'booking',
      booking.id,
      booking.professional_id,
      jsonb_build_object(
        'paymentIntentId',intent_ref,
        'financialQuoteId',quote.id,
        'customerBookingFeePence',quote.customer_platform_fee_pence,
        'professionalCommissionPence',quote.professional_platform_fee_pence,
        'pricingPlan',quote.pricing_plan_key
      ),
      jsonb_build_array(
        jsonb_build_object(
          'accountCode','provider_clearing',
          'amountPence',payment.captured_pence
        ),
        jsonb_build_object(
          'accountCode','platform_fee_revenue',
          'amountPence',-payment.captured_pence
        )
      )
    );
  END IF;
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops,beauty_financial_worker,beauty_payment_worker;
ALTER FUNCTION beauty.reserve_booking(uuid,timestamptz) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.prepare_booking_financial_quote(uuid) OWNER TO beauty_financial_worker;
ALTER FUNCTION beauty.record_booking_payment_finance(uuid,text) OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops,beauty_financial_worker,beauty_payment_worker;


CREATE OR REPLACE FUNCTION beauty.apply_checkout_payment(
  event_ref text,
  target uuid,
  session_ref text,
  intent_ref text,
  amount integer,
  currency_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  booking beauty.bookings;
  payment beauty.payments;
  quote beauty.financial_quotes;
BEGIN
  IF EXISTS(
    SELECT 1 FROM beauty.payment_events WHERE event_id=event_ref
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO booking FROM beauty.bookings WHERE id=target;
  IF booking.id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_BOOKING' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(booking.professional_id::text,0)
  );

  SELECT * INTO booking FROM beauty.bookings WHERE id=target FOR UPDATE;
  SELECT * INTO payment FROM beauty.payments WHERE booking_id=target FOR UPDATE;
  SELECT * INTO quote FROM beauty.financial_quotes WHERE booking_id=target;

  IF payment.stripe_session_id IS DISTINCT FROM session_ref
    OR quote.id IS NULL
    OR amount IS DISTINCT FROM quote.customer_total_pence
    OR currency_code IS DISTINCT FROM 'gbp'
    OR intent_ref IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE='22023';
  END IF;

  IF payment.captured_pence>0 THEN
    IF payment.stripe_payment_intent_id IS DISTINCT FROM intent_ref THEN
      RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE='22023';
    END IF;
  ELSE
    UPDATE beauty.payments
    SET captured_pence=amount,
        stripe_payment_intent_id=intent_ref,
        status=CASE
          WHEN booking.status='payment_pending'
            AND booking.hold_expires_at>now()
          THEN 'paid'
          ELSE 'refund_required'
        END,
        updated_at=now()
    WHERE booking_id=target;

    IF booking.status='payment_pending'
      AND booking.hold_expires_at>now() THEN
      UPDATE beauty.bookings SET status='confirmed' WHERE id=target;
      PERFORM beauty.enqueue_booking_notifications(target,'confirmation');
    END IF;
  END IF;

  INSERT INTO beauty.payment_events(event_id)
  VALUES(event_ref)
  ON CONFLICT DO NOTHING;
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.apply_checkout_payment(text,uuid,text,text,integer,text)
  OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;

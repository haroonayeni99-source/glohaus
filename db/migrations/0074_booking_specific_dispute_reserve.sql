-- Ring-fence only the professional proceeds tied to a disputed booking.
-- Unrelated wallet funds remain withdrawable by default. Full-wallet payout
-- restrictions are used only when the disputed booking amount cannot be fully
-- reserved, or when a separate risk/admin control is applied.

ALTER TABLE beauty.booking_disputes
  ADD COLUMN reserved_pending_pence integer NOT NULL DEFAULT 0
    CHECK (reserved_pending_pence >= 0),
  ADD COLUMN reserved_available_pence integer NOT NULL DEFAULT 0
    CHECK (reserved_available_pence >= 0),
  ADD COLUMN reserve_shortfall_pence integer NOT NULL DEFAULT 0
    CHECK (reserve_shortfall_pence >= 0);

CREATE OR REPLACE FUNCTION beauty.sync_booking_dispute(
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
  quote beauty.financial_quotes;
  dispute beauty.booking_disputes;
  target_reserve integer:=0;
  pending_balance integer:=0;
  available_balance integer:=0;
  reserve_pending integer:=0;
  reserve_available integer:=0;
  reserve_total integer:=0;
  shortfall integer:=0;
  remaining integer:=0;
  was_released boolean:=false;
  open_status boolean:=false;
  rows jsonb;
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

  IF booking.id IS NULL THEN
    RAISE EXCEPTION 'DISPUTE_MISMATCH' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(booking.professional_id::text,0));
  PERFORM beauty.ensure_financial_accounts(booking.professional_id);

  SELECT q.* INTO quote
  FROM beauty.financial_quotes q
  WHERE q.booking_id=booking.id;

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
    )
    RETURNING * INTO dispute;
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
    WHERE stripe_dispute_id=dispute_ref
    RETURNING * INTO dispute;
  END IF;

  open_status:=dispute_status IN (
    'warning_needs_response','warning_under_review','needs_response','under_review'
  );

  IF open_status
     AND NOT EXISTS(
       SELECT 1 FROM beauty.financial_ledger_transactions
       WHERE event_reference='booking-dispute-reserve:'||dispute_ref
     )
  THEN
    IF quote.id IS NOT NULL
       AND quote.professional_proceeds_pence>0
       AND quote.customer_total_pence>0 THEN
      target_reserve:=least(
        quote.professional_proceeds_pence,
        ceil(
          quote.professional_proceeds_pence::numeric
          * least(amount,quote.customer_total_pence)::numeric
          / quote.customer_total_pence::numeric
        )::integer
      );
    END IF;

    IF target_reserve>0 THEN
      SELECT EXISTS(
        SELECT 1 FROM beauty.financial_ledger_transactions
        WHERE event_reference='booking-release:'||booking.id::text
      ) INTO was_released;

      SELECT
        greatest(0,coalesce(-sum(e.amount_pence)
          FILTER(WHERE a.code='professional_pending'),0))::integer,
        greatest(0,coalesce(-sum(e.amount_pence)
          FILTER(WHERE a.code='professional_available'),0))::integer
      INTO pending_balance,available_balance
      FROM beauty.financial_ledger_accounts a
      LEFT JOIN beauty.financial_ledger_entries e ON e.account_id=a.id
      WHERE a.professional_id=booking.professional_id;

      remaining:=target_reserve;

      IF NOT was_released THEN
        reserve_pending:=least(remaining,pending_balance);
        remaining:=remaining-reserve_pending;
      END IF;

      reserve_available:=least(remaining,available_balance);
      remaining:=remaining-reserve_available;

      reserve_total:=reserve_pending+reserve_available;
      shortfall:=remaining;

      IF reserve_total>0 THEN
        rows:=jsonb_build_array(
          jsonb_build_object(
            'accountCode','professional_disputed',
            'amountPence',-reserve_total
          )
        );

        IF reserve_pending>0 THEN
          rows:=rows||jsonb_build_array(jsonb_build_object(
            'accountCode','professional_pending',
            'amountPence',reserve_pending
          ));
        END IF;

        IF reserve_available>0 THEN
          rows:=rows||jsonb_build_array(jsonb_build_object(
            'accountCode','professional_available',
            'amountPence',reserve_available
          ));
        END IF;

        PERFORM beauty.record_financial_ledger(
          'booking-dispute-reserve:'||dispute_ref,
          'dispute',
          'dispute',
          dispute.id,
          booking.professional_id,
          jsonb_build_object(
            'bookingId',booking.id,
            'stripeDisputeId',dispute_ref,
            'stripeDisputeAmountPence',amount,
            'professionalTargetReservePence',target_reserve,
            'reservedPendingPence',reserve_pending,
            'reservedAvailablePence',reserve_available,
            'reserveShortfallPence',shortfall,
            'fullWalletFrozen',shortfall>0
          ),
          rows
        );
      END IF;

      UPDATE beauty.booking_disputes
      SET reserved_pending_pence=reserve_pending,
          reserved_available_pence=reserve_available,
          reserve_shortfall_pence=shortfall,
          updated_at=now()
      WHERE id=dispute.id
      RETURNING * INTO dispute;

      IF shortfall>0 THEN
        INSERT INTO beauty.professional_financial_controls(professional_id)
        VALUES(booking.professional_id)
        ON CONFLICT DO NOTHING;

        UPDATE beauty.professional_financial_controls
        SET withdrawals_blocked=true,
            instant_payout_blocked=true,
            review_status='under_review',
            updated_at=now()
        WHERE professional_id=booking.professional_id
          AND updated_by_user_id IS NULL;
      END IF;
    END IF;
  ELSIF dispute_status IN ('won','warning_closed')
        AND NOT EXISTS(
          SELECT 1 FROM beauty.financial_ledger_transactions
          WHERE event_reference='booking-dispute-release:'||dispute_ref
        )
  THEN
    reserve_pending:=dispute.reserved_pending_pence;
    reserve_available:=dispute.reserved_available_pence;
    reserve_total:=reserve_pending+reserve_available;

    IF reserve_total>0 THEN
      rows:=jsonb_build_array(
        jsonb_build_object(
          'accountCode','professional_disputed',
          'amountPence',reserve_total
        )
      );

      IF reserve_pending>0 THEN
        rows:=rows||jsonb_build_array(jsonb_build_object(
          'accountCode','professional_pending',
          'amountPence',-reserve_pending
        ));
      END IF;

      IF reserve_available>0 THEN
        rows:=rows||jsonb_build_array(jsonb_build_object(
          'accountCode','professional_available',
          'amountPence',-reserve_available
        ));
      END IF;

      PERFORM beauty.record_financial_ledger(
        'booking-dispute-release:'||dispute_ref,
        'reserve_release',
        'dispute',
        dispute.id,
        booking.professional_id,
        jsonb_build_object(
          'bookingId',booking.id,
          'stripeDisputeId',dispute_ref,
          'outcome',dispute_status
        ),
        rows
      );
    END IF;

    UPDATE beauty.booking_disputes
    SET reserve_shortfall_pence=0,
        updated_at=now()
    WHERE id=dispute.id;

    IF NOT EXISTS(
      SELECT 1
      FROM beauty.booking_disputes d
      JOIN beauty.bookings b ON b.id=d.booking_id
      WHERE b.professional_id=booking.professional_id
        AND d.id<>dispute.id
        AND d.reserve_shortfall_pence>0
        AND d.status IN (
          'warning_needs_response','warning_under_review',
          'needs_response','under_review','lost'
        )
    ) THEN
      UPDATE beauty.professional_financial_controls
      SET withdrawals_blocked=false,
          instant_payout_blocked=false,
          review_status='clear',
          updated_at=now()
      WHERE professional_id=booking.professional_id
        AND updated_by_user_id IS NULL
        AND review_status='under_review';
    END IF;
  END IF;

  INSERT INTO beauty.payment_events(event_id) VALUES(event_ref)
  ON CONFLICT DO NOTHING;
END;
$fn$;

ALTER FUNCTION beauty.sync_booking_dispute(
  text,text,text,integer,text,text,text,bigint
) OWNER TO beauty_payment_worker;

REVOKE ALL ON FUNCTION beauty.sync_booking_dispute(
  text,text,text,integer,text,text,text,bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.sync_booking_dispute(
  text,text,text,integer,text,text,text,bigint
) TO beauty_payment_worker;

CREATE OR REPLACE FUNCTION beauty.release_my_mature_booking_proceeds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  target_professional uuid;
  target_booking record;
  released_count integer:=0;
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
      AND NOT EXISTS(
        SELECT 1
        FROM beauty.booking_disputes d
        WHERE d.booking_id=b.id
          AND d.status IN (
            'warning_needs_response','warning_under_review',
            'needs_response','under_review','lost'
          )
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
END;
$fn$;

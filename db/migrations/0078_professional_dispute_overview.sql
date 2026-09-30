-- Professional-facing booking dispute summary.
-- Exposes only the professional's own booking dispute state and hides Stripe IDs.

CREATE FUNCTION beauty.my_booking_dispute_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  target_professional uuid;
  payload jsonb;
BEGIN
  SELECT p.id INTO target_professional
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  IF target_professional IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'counts',
    jsonb_build_object(
      'open',count(*) FILTER(WHERE d.status IN(
        'warning_needs_response','warning_under_review',
        'needs_response','under_review'
      )),
      'won',count(*) FILTER(WHERE d.status IN('won','warning_closed')),
      'lost',count(*) FILTER(WHERE d.status='lost')
    ),
    'disputes',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',d.id,
          'bookingId',b.id,
          'serviceName',b.service_name,
          'startsAt',b.starts_at,
          'status',d.status,
          'reason',d.reason,
          'amountPence',d.amount_pence,
          'reservedPence',
            d.reserved_pending_pence+d.reserved_available_pence,
          'reserveShortfallPence',d.reserve_shortfall_pence,
          'evidenceDueAt',d.evidence_due_at,
          'updatedAt',d.updated_at
        )
        ORDER BY d.updated_at DESC,d.id DESC
      ),
      '[]'::jsonb
    )
  )
  INTO payload
  FROM beauty.booking_disputes d
  JOIN beauty.bookings b ON b.id=d.booking_id
  WHERE b.professional_id=target_professional;

  RETURN coalesce(
    payload,
    jsonb_build_object(
      'counts',jsonb_build_object('open',0,'won',0,'lost',0),
      'disputes','[]'::jsonb
    )
  );
END;
$fn$;

GRANT CREATE ON SCHEMA beauty TO beauty_payment_worker;
ALTER FUNCTION beauty.my_booking_dispute_overview()
  OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_payment_worker;

REVOKE ALL ON FUNCTION beauty.my_booking_dispute_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.my_booking_dispute_overview() TO beauty_app;

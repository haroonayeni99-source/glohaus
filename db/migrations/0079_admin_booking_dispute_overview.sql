-- Admin-only read model for booking disputes.
-- Keeps the browser/app role out of the protected dispute table while allowing
-- verified administrators to inspect current dispute state.

CREATE FUNCTION beauty.admin_booking_dispute_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  payload jsonb;
BEGIN
  PERFORM beauty.require_admin();

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',d.id,
        'booking_id',d.booking_id,
        'status',d.status,
        'reason',d.reason,
        'amount_pence',d.amount_pence,
        'reserved_pending_pence',d.reserved_pending_pence,
        'reserved_available_pence',d.reserved_available_pence,
        'reserve_shortfall_pence',d.reserve_shortfall_pence,
        'evidence_due_at',d.evidence_due_at,
        'updated_at',d.updated_at
      )
      ORDER BY d.updated_at DESC,d.id DESC
    ),
    '[]'::jsonb
  )
  INTO payload
  FROM (
    SELECT *
    FROM beauty.booking_disputes
    ORDER BY updated_at DESC,id DESC
    LIMIT 100
  ) d;

  RETURN payload;
END;
$fn$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_booking_dispute_overview()
  OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;

REVOKE ALL ON FUNCTION beauty.admin_booking_dispute_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_booking_dispute_overview() TO beauty_app;

-- Read-only payment oversight for verified platform administrators.
-- Provider session/payment IDs remain excluded from the application response.
GRANT SELECT ON beauty.payments,beauty.refund_decisions TO beauty_admin_ops;

CREATE POLICY admin_booking_payments_read ON beauty.payments
FOR SELECT TO beauty_admin_ops USING(true);

CREATE POLICY admin_refund_decisions_read ON beauty.refund_decisions
FOR SELECT TO beauty_admin_ops USING(true);

CREATE FUNCTION beauty.admin_payment_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $admin_payments$
BEGIN
  PERFORM beauty.require_admin();

  RETURN jsonb_build_object(
    'counts',
    jsonb_build_object(
      'capturedPence',
        coalesce((SELECT sum(captured_pence)::bigint FROM beauty.payments),0),
      'refundedPence',
        coalesce((SELECT sum(refunded_pence)::bigint FROM beauty.payments),0),
      'refundRequired',
        (SELECT count(*)::integer FROM beauty.payments WHERE status='refund_required'),
      'pendingPayouts',
        (
          SELECT count(*)::integer
          FROM beauty.financial_payouts
          WHERE status IN('requested','processing')
        ),
      'paidPayoutsPence',
        coalesce(
          (
            SELECT sum(bank_amount_pence)::bigint
            FROM beauty.financial_payouts
            WHERE status='paid'
          ),
          0
        )
    ),
    'bookingPayments',
    (
      SELECT coalesce(jsonb_agg(row_data),'[]'::jsonb)
      FROM (
        SELECT
          b.id AS booking_id,
          b.service_name,
          b.professional_name,
          b.customer_name,
          p.captured_pence,
          p.refunded_pence,
          p.status,
          p.updated_at,
          r.status AS refund_status,
          r.amount_pence AS refund_amount_pence
        FROM beauty.payments p
        JOIN beauty.bookings b ON b.id=p.booking_id
        LEFT JOIN beauty.refund_decisions r ON r.booking_id=b.id
        ORDER BY p.updated_at DESC,b.id DESC
        LIMIT 100
      ) row_data
    ),
    'payouts',
    (
      SELECT coalesce(jsonb_agg(row_data),'[]'::jsonb)
      FROM (
        SELECT
          payout.id,
          pro.business_name AS professional_name,
          payout.kind,
          payout.requested_pence,
          payout.withdrawal_fee_pence,
          payout.bank_amount_pence,
          payout.expected_arrival_at,
          payout.status,
          payout.created_at
        FROM beauty.financial_payouts payout
        JOIN beauty.professional_profiles pro
          ON pro.id=payout.professional_id
        ORDER BY payout.created_at DESC,payout.id DESC
        LIMIT 100
      ) row_data
    )
  );
END $admin_payments$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_payment_overview()
  OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;

REVOKE ALL ON FUNCTION beauty.admin_payment_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_payment_overview() TO beauty_app;

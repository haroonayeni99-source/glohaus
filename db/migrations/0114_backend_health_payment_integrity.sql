-- Extend Owner Backend Health with payment/refund/payout/dispute integrity checks.

CREATE OR REPLACE FUNCTION beauty.owner_backend_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM beauty.require_owner();

  RETURN jsonb_build_object(
    'jobs', jsonb_build_object(
      'maintenance', jsonb_build_object(
        'lastSuccessAt',(SELECT max(created_at) FROM beauty.backend_job_runs WHERE job_name='maintenance' AND succeeded),
        'lastFailureAt',(SELECT max(created_at) FROM beauty.backend_job_runs WHERE job_name='maintenance' AND NOT succeeded),
        'failures24h',(SELECT count(*)::integer FROM beauty.backend_job_runs WHERE job_name='maintenance' AND NOT succeeded AND created_at>=now()-interval '24 hours')
      ),
      'notifications', jsonb_build_object(
        'lastSuccessAt',(SELECT max(created_at) FROM beauty.backend_job_runs WHERE job_name='notifications' AND succeeded),
        'lastFailureAt',(SELECT max(created_at) FROM beauty.backend_job_runs WHERE job_name='notifications' AND NOT succeeded),
        'failures24h',(SELECT count(*)::integer FROM beauty.backend_job_runs WHERE job_name='notifications' AND NOT succeeded AND created_at>=now()-interval '24 hours')
      )
    ),
    'queues', jsonb_build_object(
      'bookingEmailPending',(SELECT count(*)::integer FROM beauty.notification_outbox WHERE sent_at IS NULL AND attempts<5),
      'bookingEmailExhausted',(SELECT count(*)::integer FROM beauty.notification_outbox WHERE sent_at IS NULL AND attempts>=5),
      'productEmailPending',(SELECT count(*)::integer FROM beauty.product_notification_outbox WHERE sent_at IS NULL AND attempts<5),
      'productEmailExhausted',(SELECT count(*)::integer FROM beauty.product_notification_outbox WHERE sent_at IS NULL AND attempts>=5),
      'marketingPending',(SELECT count(*)::integer FROM beauty.marketing_outbox WHERE sent_at IS NULL AND attempts<5),
      'marketingExhausted',(SELECT count(*)::integer FROM beauty.marketing_outbox WHERE sent_at IS NULL AND attempts>=5)
    ),
    'integrity',jsonb_build_object(
      'unbalancedLedgerTransactions',(
        SELECT count(*)::integer FROM (
          SELECT transaction_id FROM beauty.financial_ledger_entries
          GROUP BY transaction_id HAVING sum(amount_pence)<>0
        ) x
      ),
      'negativeProfessionalAvailableBalances',(
        SELECT count(*)::integer FROM (
          SELECT a.professional_id,
                 sum(CASE WHEN a.code='professional_available' THEN -e.amount_pence ELSE 0 END) AS available_pence
          FROM beauty.financial_ledger_entries e
          JOIN beauty.financial_ledger_accounts a ON a.id=e.account_id
          WHERE a.professional_id IS NOT NULL
          GROUP BY a.professional_id
        ) x WHERE available_pence<0
      ),
      'bookingsMissingQuote',(
        SELECT count(*)::integer FROM beauty.bookings b
        WHERE b.status NOT IN('draft','expired')
          AND NOT EXISTS(SELECT 1 FROM beauty.financial_quotes q WHERE q.booking_id=b.id)
      ),
      'paidOrdersMissingPaymentLedger',(
        SELECT count(*)::integer FROM beauty.product_orders o
        WHERE o.status IN('paid','processing','shipped','delivered')
          AND NOT EXISTS(
            SELECT 1 FROM beauty.financial_ledger_transactions t
            WHERE t.event_reference='product-payment:'||o.id::text
          )
      ),
      'bookingRefundAmountMismatches',(
        SELECT count(*)::integer FROM beauty.payments p
        WHERE p.refunded_pence>p.captured_pence
           OR p.captured_pence<0
           OR p.refunded_pence<0
      ),
      'bookingTransfersMissingProviderId',(
        SELECT count(*)::integer FROM beauty.payments
        WHERE transferred_at IS NOT NULL AND stripe_transfer_id IS NULL
      ),
      'productTransfersMissingProviderId',(
        SELECT count(*)::integer FROM beauty.product_orders
        WHERE transferred_at IS NOT NULL AND stripe_transfer_id IS NULL
      ),
      'payoutAmountMismatches',(
        SELECT count(*)::integer FROM beauty.financial_payouts
        WHERE requested_pence<0
           OR withdrawal_fee_pence<0
           OR bank_amount_pence<0
           OR bank_amount_pence+withdrawal_fee_pence<>requested_pence
      ),
      'openDisputeReserveMismatches',(
        SELECT count(*)::integer FROM beauty.booking_disputes
        WHERE status IN(
          'warning_needs_response','warning_under_review',
          'needs_response','under_review','lost'
        )
          AND coalesce(reserved_pending_pence,0)
              +coalesce(reserved_available_pence,0)
              +coalesce(reserve_shortfall_pence,0)<>amount_pence
      )
    )
  );
END;
$function$
;

ALTER FUNCTION beauty.owner_backend_health() OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.owner_backend_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_backend_health() TO beauty_app;

-- Verified-admin financial reporting.
-- Read-only operational reporting: no manual ledger mutation is exposed.

CREATE OR REPLACE FUNCTION beauty.admin_finance_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE actor uuid;
BEGIN
  actor:=beauty.require_admin();

  RETURN jsonb_build_object(
    'metrics', jsonb_build_object(
      'platformRevenuePence', (
        SELECT coalesce(-sum(e.amount_pence),0)::bigint
        FROM beauty.financial_ledger_entries e
        JOIN beauty.financial_ledger_accounts a ON a.id=e.account_id
        WHERE a.code='platform_fee_revenue'
      ),
      'platformRevenue30dPence', (
        SELECT coalesce(-sum(e.amount_pence),0)::bigint
        FROM beauty.financial_ledger_entries e
        JOIN beauty.financial_ledger_accounts a ON a.id=e.account_id
        JOIN beauty.financial_ledger_transactions t ON t.id=e.transaction_id
        WHERE a.code='platform_fee_revenue'
          AND t.posted_at>=now()-interval '30 days'
      ),
      'bookingCapturedPence', (
        SELECT coalesce(sum(captured_pence),0)::bigint FROM beauty.payments
      ),
      'bookingRefundedPence', (
        SELECT coalesce(sum(refunded_pence),0)::bigint FROM beauty.payments
      ),
      'activePaidSubscriptions', (
        SELECT count(*)::integer
        FROM beauty.professional_subscriptions
        WHERE status='active' AND plan_key IN ('pro','premium')
      ),
      'activeSubscriptionMrrPence', (
        SELECT coalesce(sum(d.monthly_price_pence),0)::bigint
        FROM beauty.professional_subscriptions s
        JOIN beauty.professional_plan_definitions d ON d.plan_key=s.plan_key
        WHERE s.status='active' AND s.plan_key IN ('pro','premium')
      ),
      'professionalPendingPence', (
        SELECT greatest(0,coalesce(-sum(e.amount_pence),0))::bigint
        FROM beauty.financial_ledger_entries e
        JOIN beauty.financial_ledger_accounts a ON a.id=e.account_id
        WHERE a.code='professional_pending'
      ),
      'professionalAvailablePence', (
        SELECT greatest(0,coalesce(-sum(e.amount_pence),0))::bigint
        FROM beauty.financial_ledger_entries e
        JOIN beauty.financial_ledger_accounts a ON a.id=e.account_id
        WHERE a.code='professional_available'
      ),
      'professionalOutstandingPence', (
        SELECT greatest(0,coalesce(sum(e.amount_pence),0))::bigint
        FROM beauty.financial_ledger_entries e
        JOIN beauty.financial_ledger_accounts a ON a.id=e.account_id
        WHERE a.code='professional_outstanding_obligation'
      ),
      'payoutRequestedPence', (
        SELECT coalesce(sum(requested_pence),0)::bigint
        FROM beauty.financial_payouts
      ),
      'payoutPaidPence', (
        SELECT coalesce(sum(bank_amount_pence) FILTER(WHERE status='paid'),0)::bigint
        FROM beauty.financial_payouts
      ),
      'instantWithdrawalFeesPence', (
        SELECT coalesce(sum(withdrawal_fee_pence) FILTER(WHERE kind='instant' AND status<>'failed' AND status<>'cancelled'),0)::bigint
        FROM beauty.financial_payouts
      )
    ),
    'payoutCounts', (
      SELECT jsonb_build_object(
        'requested',count(*) FILTER(WHERE status='requested'),
        'processing',count(*) FILTER(WHERE status='processing'),
        'paid',count(*) FILTER(WHERE status='paid'),
        'failed',count(*) FILTER(WHERE status='failed'),
        'cancelled',count(*) FILTER(WHERE status='cancelled')
      )
      FROM beauty.financial_payouts
    ),
    'revenueBySource30d', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'source',source,
        'revenuePence',revenue_pence
      ) ORDER BY revenue_pence DESC,source),'[]'::jsonb)
      FROM (
        SELECT
          coalesce(t.reference_type,'unknown') AS source,
          coalesce(-sum(e.amount_pence),0)::bigint AS revenue_pence
        FROM beauty.financial_ledger_entries e
        JOIN beauty.financial_ledger_accounts a ON a.id=e.account_id
        JOIN beauty.financial_ledger_transactions t ON t.id=e.transaction_id
        WHERE a.code='platform_fee_revenue'
          AND t.posted_at>=now()-interval '30 days'
        GROUP BY coalesce(t.reference_type,'unknown')
      ) breakdown
    ),
    'recentPayouts', (
      SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC),'[]'::jsonb)
      FROM (
        SELECT
          payout.id,
          payout.kind,
          payout.requested_pence,
          payout.withdrawal_fee_pence,
          payout.bank_amount_pence,
          payout.status,
          payout.expected_arrival_at,
          payout.created_at,
          professional.business_name
        FROM beauty.financial_payouts payout
        JOIN beauty.professional_profiles professional
          ON professional.id=payout.professional_id
        ORDER BY payout.created_at DESC,payout.id DESC
        LIMIT 50
      ) x
    )
  );
END $$;

REVOKE ALL ON FUNCTION beauty.admin_finance_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_finance_overview() TO beauty_app;

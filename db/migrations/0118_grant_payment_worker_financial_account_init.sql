-- Allow the payment/dispute worker to initialize the internal financial
-- ledger accounts it needs when reconciling disputes. This is a narrow
-- EXECUTE grant and does not broaden table write permissions.

GRANT EXECUTE ON FUNCTION beauty.ensure_financial_accounts(uuid)
TO beauty_payment_worker;

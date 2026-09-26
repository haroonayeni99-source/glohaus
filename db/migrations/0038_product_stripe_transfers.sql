-- Record Stripe transfers for released product proceeds.
-- Separate charges and transfers keep funds on GLOHAUS until the protected
-- delivery window has passed; this migration makes the outbound transfer
-- idempotent and ledger-backed.

ALTER TABLE beauty.product_orders
  ADD COLUMN stripe_transfer_id text UNIQUE,
  ADD COLUMN transferred_at timestamptz;


GRANT SELECT ON beauty.financial_ledger_transactions TO beauty_payment_worker;
CREATE POLICY product_transfer_ledger_worker ON beauty.financial_ledger_transactions
FOR SELECT TO beauty_payment_worker USING(true);

CREATE FUNCTION beauty.record_product_transfer(
  target_order uuid,
  transfer_ref text,
  amount integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE target beauty.product_orders;
BEGIN
  IF length(trim(coalesce(transfer_ref,'')))<3 OR amount IS NULL OR amount<=0 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT * INTO target
  FROM beauty.product_orders
  WHERE id=target_order
  FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';
  END IF;

  IF target.stripe_transfer_id IS NOT NULL THEN
    IF target.stripe_transfer_id IS DISTINCT FROM transfer_ref THEN
      RAISE EXCEPTION 'TRANSFER_MISMATCH' USING ERRCODE='22023';
    END IF;
    RETURN;
  END IF;

  IF target.status<>'delivered'
    OR target.delivered_at IS NULL
    OR target.delivered_at>now()-interval '48 hours'
    OR target.professional_proceeds_pence<>amount
    OR NOT EXISTS(
      SELECT 1
      FROM beauty.financial_ledger_transactions t
      WHERE t.event_reference='product-release:'||target.id::text
        AND t.kind='release'
        AND t.reference_type='product_order'
        AND t.reference_id=target.id
        AND t.professional_id=target.professional_id
    ) THEN
    RAISE EXCEPTION 'TRANSFER_NOT_READY' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.product_orders
  SET stripe_transfer_id=trim(transfer_ref),
      transferred_at=now(),
      updated_at=now()
  WHERE id=target.id;

  PERFORM beauty.record_financial_ledger(
    'product-transfer:'||target.id::text,
    'payout',
    'product_order',
    target.id,
    target.professional_id,
    jsonb_build_object(
      'stripeTransferId',trim(transfer_ref),
      'checkoutReference',target.checkout_reference
    ),
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

GRANT CREATE ON SCHEMA beauty TO beauty_payment_worker;
ALTER FUNCTION beauty.record_product_transfer(uuid,text,integer)
  OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_payment_worker;

REVOKE ALL ON FUNCTION beauty.record_product_transfer(uuid,text,integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.record_product_transfer(uuid,text,integer)
  TO beauty_payment_worker;

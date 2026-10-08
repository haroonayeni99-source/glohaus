-- Release product proceeds 48 hours after shipping confirmation rather than
-- 48 hours after customer delivery confirmation. This matches the approved
-- GLOHAUS policy: professional product proceeds are releasable two days after
-- the professional marks the order as shipped with tracking.

DO $migration$
DECLARE
  fn text;
  updated_fn text;
  old_block text := $old$
  FOR target_order IN
    SELECT o.id,o.professional_id,o.professional_proceeds_pence,o.delivered_at
    FROM beauty.product_orders o
    WHERE o.status='delivered'
      AND o.delivered_at IS NOT NULL
      AND o.delivered_at<=now()-interval '48 hours'
      AND o.professional_proceeds_pence>0
      AND NOT EXISTS(
        SELECT 1 FROM beauty.financial_ledger_transactions t
        WHERE t.event_reference='product-release:'||o.id::text
      )
    ORDER BY o.delivered_at,o.id
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    PERFORM beauty.record_financial_ledger(
      'product-release:'||target_order.id::text,
      'release','product_order',target_order.id,target_order.professional_id,
      jsonb_build_object(
        'releasePolicy','tracked_delivery_plus_48h',
        'deliveredAt',target_order.delivered_at,
        'automation','scheduled_maintenance'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'accountCode','professional_pending',
          'amountPence',target_order.professional_proceeds_pence
        ),
        jsonb_build_object(
          'accountCode','professional_available',
          'amountPence',-target_order.professional_proceeds_pence
        )
      )
    );
    released_products:=released_products+1;
  END LOOP;
$old$;
  new_block text := $new$
  FOR target_order IN
    SELECT o.id,o.professional_id,o.professional_proceeds_pence,o.shipped_at
    FROM beauty.product_orders o
    WHERE o.status IN('shipped','delivered')
      AND o.shipped_at IS NOT NULL
      AND o.shipped_at<=now()-interval '48 hours'
      AND o.professional_proceeds_pence>0
      AND NOT EXISTS(
        SELECT 1 FROM beauty.financial_ledger_transactions t
        WHERE t.event_reference='product-release:'||o.id::text
      )
    ORDER BY o.shipped_at,o.id
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    PERFORM beauty.record_financial_ledger(
      'product-release:'||target_order.id::text,
      'release','product_order',target_order.id,target_order.professional_id,
      jsonb_build_object(
        'releasePolicy','shipping_confirmation_plus_48h',
        'shippedAt',target_order.shipped_at,
        'automation','scheduled_maintenance'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'accountCode','professional_pending',
          'amountPence',target_order.professional_proceeds_pence
        ),
        jsonb_build_object(
          'accountCode','professional_available',
          'amountPence',-target_order.professional_proceeds_pence
        )
      )
    );
    released_products:=released_products+1;
  END LOOP;
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='beauty'
    AND p.proname='run_scheduled_maintenance'
  LIMIT 1;

  IF fn IS NULL THEN
    RAISE EXCEPTION 'run_scheduled_maintenance not found';
  END IF;

  updated_fn := replace(fn, old_block, new_block);

  IF updated_fn = fn THEN
    RAISE EXCEPTION 'expected product release block was not found';
  END IF;

  EXECUTE updated_fn;
END;
$migration$;

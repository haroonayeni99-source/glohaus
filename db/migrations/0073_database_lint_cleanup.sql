-- Clean up database lint findings after dispute protection.
DROP POLICY IF EXISTS shop_controls_payment_worker
  ON beauty.professional_financial_controls;

CREATE INDEX IF NOT EXISTS product_order_refund_decisions_actor_idx
  ON beauty.product_order_refund_decisions(actor_id);

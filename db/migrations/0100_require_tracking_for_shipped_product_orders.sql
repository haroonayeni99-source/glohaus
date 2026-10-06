-- Product orders may only be considered shipped/delivered when they have
-- usable carrier and tracking details. This protects the rule at the database
-- layer even if a future API path is added.

ALTER TABLE beauty.product_orders
  DROP CONSTRAINT IF EXISTS product_orders_tracking_required_when_shipped;

ALTER TABLE beauty.product_orders
  ADD CONSTRAINT product_orders_tracking_required_when_shipped
  CHECK (
    status NOT IN ('shipped','delivered')
    OR (
      length(trim(coalesce(tracking_carrier,''))) >= 2
      AND length(trim(coalesce(tracking_number,''))) >= 3
    )
  );

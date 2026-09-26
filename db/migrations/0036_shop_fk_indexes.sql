-- Cover Shop foreign keys used by cart, checkout and order workflows.

CREATE INDEX IF NOT EXISTS cart_items_product
  ON beauty.cart_items(product_id);

CREATE INDEX IF NOT EXISTS product_order_items_product
  ON beauty.product_order_items(product_id);

CREATE INDEX IF NOT EXISTS product_orders_fee_rule
  ON beauty.product_orders(fee_rule_id)
  WHERE fee_rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_image_asset_professional
  ON beauty.products(image_asset_id,professional_id)
  WHERE image_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shop_checkout_items_product
  ON beauty.shop_checkout_items(product_id);

CREATE INDEX IF NOT EXISTS shop_checkout_items_professional
  ON beauty.shop_checkout_items(professional_id);

CREATE INDEX IF NOT EXISTS shop_checkouts_fee_rule
  ON beauty.shop_checkouts(fee_rule_id)
  WHERE fee_rule_id IS NOT NULL;

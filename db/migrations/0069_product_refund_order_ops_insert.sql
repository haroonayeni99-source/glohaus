-- The order-operator owns request_product_order_refund and needs INSERT
-- privilege to create the protected refund-decision row.
GRANT INSERT ON beauty.product_order_refund_decisions TO beauty_order_ops;

-- Private guest support intake; no anonymous reads or direct table writes.
CREATE ROLE beauty_support_intake NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT beauty_support_intake TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_support_intake;
CREATE TABLE beauty.support_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 100),
 email text NOT NULL CHECK(length(email) BETWEEN 3 AND 254 AND position('@' in email)>1),
 topic text NOT NULL CHECK(topic IN ('Account & sign-in','Booking','Shop order','Professional account','Other')),
 reference text NOT NULL DEFAULT '' CHECK(length(reference)<=120),
 message text NOT NULL CHECK(length(trim(message)) BETWEEN 20 AND 4000),
 rate_key text NOT NULL CHECK(rate_key ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_requests_recent ON beauty.support_requests(created_at DESC);
CREATE INDEX support_requests_inbox ON beauty.support_requests(status,created_at DESC);
CREATE INDEX support_requests_email_recent ON beauty.support_requests(email,created_at DESC);
CREATE INDEX support_requests_rate_recent ON beauty.support_requests(rate_key,created_at DESC);
ALTER TABLE beauty.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.support_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.support_requests FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT ON beauty.support_requests TO beauty_support_intake;
CREATE POLICY support_intake_read ON beauty.support_requests FOR SELECT TO beauty_support_intake USING(true);
CREATE POLICY support_intake_insert ON beauty.support_requests FOR INSERT TO beauty_support_intake WITH CHECK(true);
GRANT SELECT ON beauty.support_requests TO beauty_admin_ops;
GRANT UPDATE(status,updated_at) ON beauty.support_requests TO beauty_admin_ops;
CREATE POLICY support_admin_read ON beauty.support_requests FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY support_admin_update ON beauty.support_requests FOR UPDATE TO beauty_admin_ops USING(true) WITH CHECK(true);
CREATE TABLE beauty.support_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES beauty.support_requests(id),
 actor_id uuid NOT NULL REFERENCES beauty.users(id),
 status text NOT NULL CHECK(status IN ('open','resolved')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_request_events_request ON beauty.support_request_events(request_id,created_at DESC);
ALTER TABLE beauty.support_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.support_request_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.support_request_events FROM PUBLIC,anon,authenticated,beauty_app;
GRANT INSERT ON beauty.support_request_events TO beauty_admin_ops;
CREATE POLICY support_events_insert ON beauty.support_request_events FOR INSERT TO beauty_admin_ops WITH CHECK(true);
CREATE FUNCTION beauty.submit_support_request(request_name text,request_email text,request_topic text,request_reference text,request_message text,request_rate_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result uuid; normalized_email text:=lower(trim(request_email));
BEGIN
 -- Serialise the short intake transaction so simultaneous submissions cannot evade limits.
 PERFORM pg_advisory_xact_lock(481316);
 IF (SELECT count(*) FROM beauty.support_requests WHERE created_at>now()-interval '1 hour' AND email=normalized_email)>=5
 OR (SELECT count(*) FROM beauty.support_requests WHERE created_at>now()-interval '1 hour' AND rate_key=request_rate_key)>=10
 OR (SELECT count(*) FROM beauty.support_requests WHERE created_at>now()-interval '1 hour')>=100 THEN
  RAISE EXCEPTION 'SUPPORT_RATE_LIMIT' USING ERRCODE='P0001';
 END IF;
 INSERT INTO beauty.support_requests(name,email,topic,reference,message,rate_key)
 VALUES(trim(request_name),normalized_email,request_topic,trim(request_reference),trim(request_message),request_rate_key)
 RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION beauty.admin_support_requests() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_admin();
 RETURN (SELECT coalesce(jsonb_agg(r),'[]'::jsonb) FROM (
  SELECT id,name,email,topic,reference,message,status,created_at FROM beauty.support_requests
  ORDER BY (status='open') DESC,created_at DESC,id DESC LIMIT 100
 ) r);
END $$;
CREATE FUNCTION beauty.admin_set_support_status(request_id uuid,next_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=beauty.require_admin();
 IF next_status NOT IN ('open','resolved') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.support_requests SET status=next_status,updated_at=now() WHERE id=request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.support_request_events(request_id,actor_id,status) VALUES(request_id,actor,next_status);
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_support_intake,beauty_admin_ops;
ALTER FUNCTION beauty.submit_support_request(text,text,text,text,text,text) OWNER TO beauty_support_intake;
ALTER FUNCTION beauty.admin_support_requests() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_set_support_status(uuid,text) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_support_intake,beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.submit_support_request(text,text,text,text,text,text),beauty.admin_support_requests(),beauty.admin_set_support_status(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.submit_support_request(text,text,text,text,text,text),beauty.admin_support_requests(),beauty.admin_set_support_status(uuid,text) TO beauty_app;

-- Optional genuine previous selling price. No product price or offer is fabricated.
ALTER TABLE beauty.products ADD COLUMN compare_at_price_pence integer
 CHECK(compare_at_price_pence IS NULL OR (compare_at_price_pence>price_pence AND compare_at_price_pence<=100000000));
GRANT INSERT(compare_at_price_pence),UPDATE(compare_at_price_pence) ON beauty.products TO beauty_app;
CREATE OR REPLACE VIEW beauty.public_products WITH(security_barrier=true) AS
SELECT product.id,product.professional_id,product.name,product.description,product.price_pence,
 (product.stock_quantity>0) AS in_stock,product.image_asset_id,
 professional.slug AS professional_slug,professional.business_name AS professional_name,product.updated_at,
 product.created_at,product.compare_at_price_pence
FROM beauty.products product JOIN beauty.professional_profiles professional ON professional.id=product.professional_id
WHERE product.publication_status='published';

-- This non-login role can read only the order columns needed for aggregation.
-- The runtime receives a product-level view, never buyer, address or payment data.
CREATE ROLE beauty_shop_stats NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT beauty_shop_stats TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_shop_stats;
GRANT SELECT(id,status,created_at) ON beauty.product_orders TO beauty_shop_stats;
GRANT SELECT(product_id,order_id,quantity) ON beauty.product_order_items TO beauty_shop_stats;
GRANT SELECT ON beauty.public_products TO beauty_shop_stats;
CREATE POLICY shop_stats_orders ON beauty.product_orders FOR SELECT TO beauty_shop_stats USING(true);
CREATE POLICY shop_stats_items ON beauty.product_order_items FOR SELECT TO beauty_shop_stats USING(true);
CREATE VIEW beauty.public_product_sales WITH(security_barrier=true) AS
SELECT p.id AS product_id,coalesce(sum(i.quantity),0)::bigint AS sold_units,
 coalesce(sum(i.quantity) FILTER(WHERE o.created_at>=now()-interval '30 days'),0)::bigint AS recent_sold_units
FROM beauty.public_products p
JOIN beauty.product_order_items i ON i.product_id=p.id
JOIN beauty.product_orders o ON o.id=i.order_id AND o.status IN ('paid','processing','shipped','delivered')
GROUP BY p.id;
GRANT CREATE ON SCHEMA beauty TO beauty_shop_stats;
ALTER VIEW beauty.public_product_sales OWNER TO beauty_shop_stats;
REVOKE CREATE ON SCHEMA beauty FROM beauty_shop_stats;
REVOKE ALL ON beauty.public_product_sales FROM PUBLIC,anon,authenticated;
GRANT SELECT ON beauty.public_product_sales TO beauty_app;

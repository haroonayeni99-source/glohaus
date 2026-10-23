-- Seller controls only. No fee, refund, balance or payout rule changes.
CREATE ROLE beauty_seller_ops NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT beauty_seller_ops TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_seller_ops;
CREATE TABLE beauty.seller_settings (
 professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
 away boolean NOT NULL DEFAULT false,
 away_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(away OR away_until IS NULL)
);
ALTER TABLE beauty.seller_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.seller_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY seller_settings_owner ON beauty.seller_settings FOR ALL TO beauty_app
USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id
 WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'))
WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id
 WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'));
GRANT SELECT ON beauty.seller_settings TO beauty_app;
GRANT INSERT(professional_id,away,away_until),UPDATE(away,away_until,updated_at) ON beauty.seller_settings TO beauty_app;
GRANT SELECT ON beauty.seller_settings TO beauty_seller_ops;
CREATE POLICY seller_ops_read ON beauty.seller_settings FOR SELECT TO beauty_seller_ops USING(true);

CREATE FUNCTION beauty.seller_shop_paused(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT away AND (away_until IS NULL OR away_until>now())
 FROM beauty.seller_settings WHERE professional_id=target),false)
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_seller_ops;
ALTER FUNCTION beauty.seller_shop_paused(uuid) OWNER TO beauty_seller_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_seller_ops;
REVOKE ALL ON FUNCTION beauty.seller_shop_paused(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.seller_shop_paused(uuid) TO beauty_app,beauty_catalog,beauty_cart_ops,beauty_payment_worker;

-- Serialise settings changes with cart/check-out item insertion, including the
-- first settings row. Transactions which already reserved stock may still pay.
CREATE FUNCTION beauty.lock_seller_settings() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('seller-shop:'||NEW.professional_id::text,0));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.lock_seller_settings() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER seller_settings_lock BEFORE INSERT OR UPDATE ON beauty.seller_settings
FOR EACH ROW EXECUTE FUNCTION beauty.lock_seller_settings();

DO $$ DECLARE definition text; owner_name text; anchor text; BEGIN
 definition:=pg_get_functiondef('beauty.check_public_product_owner()'::regprocedure);
 anchor:='IF NOT beauty.professional_is_public(pro)';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'SELLER_GUARD_ANCHOR_CHANGED'; END IF;
 EXECUTE replace(definition,anchor,
  'PERFORM pg_advisory_xact_lock(hashtextextended(''seller-shop:''||pro::text,0)); IF beauty.seller_shop_paused(pro) THEN RAISE EXCEPTION ''SELLER_AWAY'' USING ERRCODE=''22023''; END IF; '||anchor);
 SELECT pg_get_userbyid(proowner) INTO owner_name FROM pg_proc WHERE oid='beauty.check_public_product_owner()'::regprocedure;
 EXECUTE format('GRANT EXECUTE ON FUNCTION beauty.seller_shop_paused(uuid) TO %I',owner_name);

 -- Preserve the current visibility guard and cart-removal behaviour.
 definition:=pg_get_functiondef('beauty.my_cart()'::regprocedure);
 anchor:='AND owner.status=''active''';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'SELLER_CART_ANCHOR_CHANGED'; END IF;
 EXECUTE replace(definition,anchor,anchor||' AND NOT beauty.seller_shop_paused(p.professional_id)');
 definition:=rtrim(trim(pg_get_viewdef('beauty.public_products'::regclass,true)),';');
 EXECUTE format('CREATE OR REPLACE VIEW beauty.public_products WITH(security_barrier=true) AS SELECT entry.*,beauty.seller_shop_paused(entry.professional_id) AS seller_away FROM (%s) entry',definition);
END $$;

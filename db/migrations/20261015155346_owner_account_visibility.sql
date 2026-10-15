-- Reversible public visibility is separate from sign-in restrictions and publication.
ALTER TABLE beauty.users
 ADD COLUMN public_hidden_at timestamptz,
 ADD COLUMN public_hidden_reason text CHECK(public_hidden_reason IS NULL OR length(trim(public_hidden_reason)) BETWEEN 5 AND 500),
 ADD COLUMN auth_cleanup_pending boolean NOT NULL DEFAULT false;

CREATE FUNCTION beauty.account_is_public(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT status='active' AND deleted_at IS NULL AND public_hidden_at IS NULL FROM beauty.users WHERE id=target),false)
$$;
CREATE FUNCTION beauty.professional_is_public(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT beauty.account_is_public(user_id) FROM beauty.professional_profiles WHERE id=target),false)
$$;
CREATE FUNCTION beauty.portfolio_owner_is_public(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT beauty.professional_is_public(professional_id) FROM beauty.portfolio_assets WHERE id=target),false)
$$;
CREATE FUNCTION beauty.photo_owner_is_public(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT beauty.professional_is_public(professional_id) FROM beauty.profile_photos WHERE id=target),false)
$$;
CREATE FUNCTION beauty.service_owner_is_public(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT beauty.professional_is_public(professional_id) FROM beauty.services WHERE id=target),false)
$$;
CREATE FUNCTION beauty.review_author_is_public(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT beauty.account_is_public(b.customer_id) FROM beauty.reviews r JOIN beauty.bookings b ON b.id=r.booking_id WHERE r.id=target),false)
$$;

-- Preserve each inspected view's columns, grants, owner, moderation and booking
-- verification rules. Add one public gate; no publication settings are rewritten.
DO $$ DECLARE item record; definition text; predicate text; BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('public_professionals','beauty.professional_is_public(entry.id)'),
 ('public_profile_details','beauty.professional_is_public(entry.id)'),
 ('public_profile_presentation','beauty.professional_is_public(entry.professional_id)'),
 ('public_professional_locations','beauty.professional_is_public(entry.professional_id)'),
 ('public_professional_specialities','beauty.professional_is_public(entry.professional_id)'),
 ('public_professional_exposure','beauty.professional_is_public(entry.professional_id)'),
 ('public_services','beauty.professional_is_public(entry.professional_id)'),
 ('public_service_options','beauty.service_owner_is_public(entry.service_id)'),
 ('public_hours','beauty.professional_is_public(entry.professional_id)'),
 ('public_products','beauty.professional_is_public(entry.professional_id)'),
 ('public_product_sales','EXISTS(SELECT 1 FROM beauty.public_products product WHERE product.id=entry.product_id)'),
 ('public_posts','beauty.professional_is_public(entry.professional_id)'),
 ('public_stories','beauty.professional_is_public(entry.professional_id)'),
 ('public_last_minute_slots','beauty.professional_is_public(entry.professional_id)'),
 ('public_portfolio','beauty.professional_is_public(entry.professional_id)'),
 ('public_media_assets','beauty.professional_is_public(entry.professional_id)'),
 ('public_portfolio_specialities','beauty.portfolio_owner_is_public(entry.asset_id)'),
 ('published_asset_paths','beauty.portfolio_owner_is_public(entry.id)'),
 ('published_media_paths','beauty.portfolio_owner_is_public(entry.id)'),
 ('published_profile_photo_paths','beauty.photo_owner_is_public(entry.id)'),
 ('public_reviews','beauty.professional_is_public(entry.professional_id) AND beauty.review_author_is_public(entry.id)')
 ) AS views(name,condition) LOOP
  definition:=rtrim(trim(pg_get_viewdef(('beauty.'||item.name)::regclass,true)),';');
  EXECUTE format('CREATE OR REPLACE VIEW beauty.%I WITH(security_barrier=true) AS SELECT entry.* FROM (%s) entry WHERE %s',item.name,definition,item.condition);
 END LOOP;
END $$;

CREATE FUNCTION beauty.owner_set_account_visibility(target uuid,hidden boolean,decision_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_owner(); previous timestamptz; pro uuid; BEGIN
 IF hidden IS NULL OR decision_reason IS NULL OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT public_hidden_at INTO previous FROM beauty.users WHERE id=target AND deleted_at IS NULL FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF target=actor OR EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=target AND role='owner') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 FOR pro IN SELECT id FROM beauty.professional_profiles WHERE user_id=target ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(pro::text,0));
  PERFORM 1 FROM beauty.products WHERE professional_id=pro ORDER BY id FOR UPDATE;
 END LOOP;
 IF hidden=(previous IS NOT NULL) THEN RETURN; END IF;
 UPDATE beauty.users SET public_hidden_at=CASE WHEN hidden THEN now() ELSE NULL END,public_hidden_reason=CASE WHEN hidden THEN trim(decision_reason) ELSE NULL END WHERE id=target;
 IF hidden THEN
  UPDATE beauty.live_sessions SET status='ended',ended_at=now() WHERE professional_id IN(SELECT id FROM beauty.professional_profiles WHERE user_id=target) AND status='live';
 END IF;
 PERFORM beauty.write_admin_audit(actor,'owner',CASE WHEN hidden THEN 'account.content.hidden' ELSE 'account.content.restored' END,target,'user',target,decision_reason,jsonb_build_object('hidden',hidden,'publication_settings_preserved',true));
END $$;

CREATE FUNCTION beauty.owner_remove_account(target uuid,decision_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_owner(); account beauty.users; BEGIN
 IF decision_reason IS NULL OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT * INTO account FROM beauty.users WHERE id=target FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF target=actor OR EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=target AND role='owner') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF account.deleted_at IS NULL THEN
  PERFORM beauty.owner_set_account_visibility(target,true,decision_reason);
  -- Existing platform deletion retains all financial/history references.
  -- Its return type differs in older installations; PERFORM supports both.
  PERFORM beauty.owner_mark_user_deleted(target,decision_reason);
  DELETE FROM beauty.user_roles WHERE user_id=target;
  UPDATE beauty.users SET auth_cleanup_pending=true WHERE id=target;
 END IF;
 RETURN (SELECT jsonb_build_object('authId',auth_id,'authCleanupPending',auth_cleanup_pending) FROM beauty.users WHERE id=target);
END $$;
CREATE FUNCTION beauty.owner_finish_auth_cleanup(target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_owner(); BEGIN
 IF target=actor OR EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=target AND role='owner') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 UPDATE beauty.users SET auth_cleanup_pending=false WHERE id=target AND deleted_at IS NOT NULL AND auth_cleanup_pending;
 IF FOUND THEN PERFORM beauty.write_admin_audit(actor,'owner','account.auth.deleted',target,'user',target,'Confirmed sign-in provider account cleanup','{}'); END IF;
END $$;

CREATE OR REPLACE FUNCTION beauty.admin_user_overview() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_admin();
 RETURN (SELECT coalesce(jsonb_agg(row_data),'[]') FROM (
  SELECT u.id,u.display_name,u.email,u.status,u.restricted_until::text,u.restriction_reason,u.deleted_at::text,
   u.public_hidden_at::text,u.public_hidden_reason,u.auth_cleanup_pending,
   ARRAY(SELECT role FROM beauty.user_roles WHERE user_id=u.id ORDER BY role) AS roles,
   (SELECT business_name FROM beauty.professional_profiles WHERE user_id=u.id LIMIT 1) AS business_name
  FROM beauty.users u ORDER BY u.created_at DESC,u.id LIMIT 100
 ) row_data);
END $$;

-- Existing carts cannot bypass the public gate. No totals, stock rules or
-- historical orders are changed. A rejected new checkout rolls back normally.
CREATE FUNCTION beauty.check_public_product_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid; BEGIN
 IF TG_TABLE_NAME='cart_items' THEN SELECT professional_id INTO pro FROM beauty.products WHERE id=NEW.product_id;
 ELSE pro:=NEW.professional_id; END IF;
 IF NOT beauty.professional_is_public(pro) THEN RAISE EXCEPTION 'CART_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_visibility_cart BEFORE INSERT OR UPDATE ON beauty.cart_items FOR EACH ROW EXECUTE FUNCTION beauty.check_public_product_owner();
CREATE TRIGGER account_visibility_checkout BEFORE INSERT ON beauty.shop_checkout_items FOR EACH ROW EXECUTE FUNCTION beauty.check_public_product_owner();

-- Keep existing LIVE and cart validation and enforce visibility on server entry.
DO $$ DECLARE definition text; anchor text; BEGIN
 definition:=pg_get_functiondef('beauty.live_eligibility(uuid)'::regprocedure);
 anchor:='verification=''verified''';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'LIVE_VISIBILITY_ANCHOR_CHANGED'; END IF;
 EXECUTE overlay(definition placing ('beauty.professional_is_public(target) AND '||anchor) from position(anchor IN definition) for length(anchor));
 definition:=pg_get_functiondef('beauty.live_session_join_info(uuid)'::regprocedure);
 anchor:='WHERE s.id=target_session';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'LIVE_JOIN_ANCHOR_CHANGED'; END IF;
 EXECUTE replace(definition,anchor,anchor||' AND beauty.professional_is_public(s.professional_id)');
 definition:=pg_get_functiondef('beauty.set_cart_item(uuid,integer)'::regprocedure);
 anchor:='SELECT p.* INTO product';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'CART_REMOVAL_ANCHOR_CHANGED'; END IF;
 EXECUTE replace(definition,anchor,'IF next_quantity=0 THEN DELETE FROM beauty.cart_items WHERE customer_id=actor.id AND product_id=target_product; RETURN beauty.my_cart(); END IF; '||anchor);
END $$;

REVOKE ALL ON FUNCTION beauty.account_is_public(uuid),beauty.professional_is_public(uuid),beauty.portfolio_owner_is_public(uuid),beauty.photo_owner_is_public(uuid),beauty.service_owner_is_public(uuid),beauty.review_author_is_public(uuid),beauty.owner_set_account_visibility(uuid,boolean,text),beauty.owner_remove_account(uuid,text),beauty.owner_finish_auth_cleanup(uuid),beauty.check_public_product_owner() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_set_account_visibility(uuid,boolean,text),beauty.owner_remove_account(uuid,text),beauty.owner_finish_auth_cleanup(uuid) TO beauty_app;
DO $$ DECLARE role_name text; BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN('beauty_app','beauty_catalog','beauty_admin_ops','beauty_booking_ops','beauty_payment_worker','beauty_financial_worker','beauty_live_ops') LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION beauty.account_is_public(uuid),beauty.professional_is_public(uuid),beauty.portfolio_owner_is_public(uuid),beauty.photo_owner_is_public(uuid),beauty.service_owner_is_public(uuid),beauty.review_author_is_public(uuid) TO %I',role_name);
 END LOOP;
END $$;

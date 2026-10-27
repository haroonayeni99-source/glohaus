-- Optional social portfolios only. No booking, payment or calendar guards change.
ALTER TABLE beauty.business_connections
 ADD COLUMN social_mode text NOT NULL DEFAULT 'approval' CHECK(social_mode IN('automatic','approval','manual')),
 ADD COLUMN sync_enabled boolean NOT NULL DEFAULT true;
UPDATE beauty.business_connections SET social_mode='automatic' WHERE auto_publish;
CREATE FUNCTION beauty.keep_social_mode_compatible() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.social_mode IS DISTINCT FROM OLD.social_mode THEN NEW.auto_publish:=NEW.social_mode='automatic';
 ELSIF NEW.auto_publish THEN NEW.social_mode:='automatic';
 ELSIF TG_OP='UPDATE' AND NEW.auto_publish IS DISTINCT FROM OLD.auto_publish THEN NEW.social_mode:='approval';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER social_mode_compatibility BEFORE INSERT OR UPDATE OF social_mode,auto_publish ON beauty.business_connections FOR EACH ROW EXECUTE FUNCTION beauty.keep_social_mode_compatible();
REVOKE ALL ON FUNCTION beauty.keep_social_mode_compatible() FROM PUBLIC,anon,authenticated;
ALTER TABLE beauty.social_portfolio
 ADD COLUMN featured boolean NOT NULL DEFAULT false,
 ADD COLUMN source_available boolean NOT NULL DEFAULT true,
 ADD COLUMN media_type text NOT NULL DEFAULT 'link' CHECK(media_type IN('link','image','carousel','video')),
 ADD COLUMN thumbnail_url text NOT NULL DEFAULT '' CHECK(length(thumbnail_url)<=4000);
UPDATE beauty.social_portfolio SET source_available=false,publication_status='draft' WHERE publication_status='unavailable';
CREATE TABLE beauty.social_portfolio_preferences(
 professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
 max_visible_posts smallint NOT NULL DEFAULT 12 CHECK(max_visible_posts BETWEEN 1 AND 40)
);
ALTER TABLE beauty.social_portfolio_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.social_portfolio_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.social_portfolio_preferences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON beauty.social_portfolio_preferences TO beauty_app;
CREATE POLICY portfolio_preferences_owner ON beauty.social_portfolio_preferences TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'))
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'));
GRANT SELECT ON beauty.social_portfolio_preferences TO beauty_catalog;
CREATE POLICY portfolio_preferences_public ON beauty.social_portfolio_preferences FOR SELECT TO beauty_catalog USING(true);
CREATE TABLE beauty.social_sync_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT true);
INSERT INTO beauty.social_sync_settings VALUES(true,true);
CREATE TABLE beauty.social_sync_controls(professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),paused boolean NOT NULL DEFAULT false);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['social_sync_settings','social_sync_controls'] LOOP
 EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
 EXECUTE format('GRANT SELECT ON beauty.%I TO beauty_app',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON beauty.%I TO beauty_admin_ops',t);
 EXECUTE format('CREATE POLICY social_control_internal ON beauty.%I TO beauty_admin_ops USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
CREATE POLICY social_settings_read ON beauty.social_sync_settings FOR SELECT TO beauty_app USING(true);
CREATE POLICY social_control_self ON beauty.social_sync_controls FOR SELECT TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'));
CREATE FUNCTION beauty.social_sync_allowed(target uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=target AND u.auth_id=beauty.auth_id() AND u.status='active')
 AND coalesce((SELECT enabled FROM beauty.social_sync_settings WHERE singleton),false)
 AND NOT coalesce((SELECT paused FROM beauty.social_sync_controls WHERE professional_id=target),false)
$$;
REVOKE ALL ON FUNCTION beauty.social_sync_allowed(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.social_sync_allowed(uuid) TO beauty_app;
CREATE OR REPLACE FUNCTION beauty.due_business_connections() RETURNS TABLE(auth_id text,professional_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT u.auth_id::text,c.professional_id FROM beauty.business_connections c JOIN beauty.professional_profiles p ON p.id=c.professional_id JOIN beauty.users u ON u.id=p.user_id
 WHERE c.status<>'disconnected' AND c.next_sync_at<=now() AND (c.lease_until IS NULL OR c.lease_until<now()) AND u.status='active'
 AND (c.provider IN('google','outlook','ics') OR (c.sync_enabled AND c.social_mode<>'manual' AND coalesce(c.last_error,'')<>'RECONNECT_REQUIRED'
 AND (SELECT enabled FROM beauty.social_sync_settings WHERE singleton) AND NOT coalesce((SELECT paused FROM beauty.social_sync_controls x WHERE x.professional_id=c.professional_id),false)))
 GROUP BY u.auth_id,c.professional_id ORDER BY min(c.next_sync_at) LIMIT 2
$$;
GRANT SELECT(last_error,sync_enabled,social_mode) ON beauty.business_connections TO beauty_admin_ops;
GRANT SELECT(id,provider,status,last_error) ON beauty.business_connections TO beauty_catalog;
CREATE POLICY social_connection_public_state ON beauty.business_connections FOR SELECT TO beauty_catalog USING(provider IN('instagram','tiktok'));
-- Reuse existing public/consent barriers, then bound each professional's visible work.
CREATE OR REPLACE VIEW beauty.public_social_portfolio WITH(security_barrier=true) AS
 SELECT id,professional_id,platform,original_url,caption,source_created_at,sort_order,slug,business_name,category,service_id,service_name,price_pence,featured,media_type,has_thumbnail
 FROM(
 SELECT s.id,s.professional_id,s.platform,s.original_url,s.caption,s.source_created_at,s.sort_order,p.slug,p.business_name,p.category,svc.id AS service_id,svc.name AS service_name,svc.from_price_pence AS price_pence,s.featured,s.media_type,(s.thumbnail_url<>'') AS has_thumbnail,
 row_number() OVER(PARTITION BY s.professional_id ORDER BY s.featured DESC,s.sort_order,s.source_created_at DESC NULLS LAST,s.created_at DESC,s.id) AS position,
 coalesce(pref.max_visible_posts,12) AS visible_limit
 FROM beauty.social_portfolio s JOIN beauty.public_professionals p ON p.id=s.professional_id
 LEFT JOIN beauty.public_services svc ON svc.id=s.service_id AND svc.professional_id=s.professional_id
 LEFT JOIN beauty.social_portfolio_preferences pref ON pref.professional_id=s.professional_id
 WHERE s.source_available AND (s.connection_id IS NULL OR EXISTS(SELECT 1 FROM beauty.business_connections c WHERE c.id=s.connection_id AND c.provider IN('instagram','tiktok') AND c.status IN('connected','error') AND coalesce(c.last_error,'')<>'RECONNECT_REQUIRED'))
 ) ranked WHERE position<=visible_limit;
CREATE VIEW beauty.public_social_thumbnails WITH(security_barrier=true) AS
 SELECT s.id,s.platform,s.thumbnail_url FROM beauty.social_portfolio s JOIN beauty.public_social_portfolio p ON p.id=s.id WHERE s.thumbnail_url<>'';
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_social_thumbnails OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
REVOKE ALL ON beauty.public_social_thumbnails FROM PUBLIC,anon,authenticated;
GRANT SELECT ON beauty.public_social_thumbnails TO beauty_app;
CREATE FUNCTION beauty.owner_social_sync_settings(target uuid,next_enabled boolean,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_owner(); BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('glohaus-social-sync',0));
 IF next_enabled IS NULL OR length(trim(coalesce(reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 IF target IS NULL THEN UPDATE beauty.social_sync_settings SET enabled=next_enabled WHERE singleton;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=target) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.social_sync_controls(professional_id,paused) VALUES(target,NOT next_enabled) ON CONFLICT(professional_id) DO UPDATE SET paused=EXCLUDED.paused;
 END IF;
 PERFORM beauty.write_admin_audit(actor,'owner','social.sync.settings',coalesce((SELECT user_id FROM beauty.professional_profiles WHERE id=target),actor),'professional',target,reason,jsonb_build_object('enabled',next_enabled,'global',target IS NULL));
END $$;
CREATE FUNCTION beauty.owner_social_sync_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_owner();
 RETURN jsonb_build_object('enabled',(SELECT enabled FROM beauty.social_sync_settings WHERE singleton),
 'accounts',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM(SELECT c.provider,count(*) FILTER(WHERE c.status='connected') AS connected,sum(c.successes) AS successes,sum(c.failures) AS failures,count(*) FILTER(WHERE c.last_error='RECONNECT_REQUIRED' AND c.status<>'disconnected') AS reconnect,max(c.last_success_at) AS last_success FROM beauty.business_connections c WHERE c.provider IN('instagram','tiktok') GROUP BY c.provider)x),
 'professionals',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM(SELECT p.id,p.business_name,coalesce(s.paused,false) AS paused,count(c.id) FILTER(WHERE c.status='connected') AS connected,count(c.id) FILTER(WHERE c.last_error='RECONNECT_REQUIRED' AND c.status<>'disconnected') AS reconnect,max(c.last_success_at) AS last_success,(SELECT count(*) FROM beauty.safety_reports r WHERE r.target_type='professional' AND r.target_id=p.id AND r.status IN('open','under_review')) AS reports FROM beauty.professional_profiles p LEFT JOIN beauty.business_connections c ON c.professional_id=p.id AND c.provider IN('instagram','tiktok') LEFT JOIN beauty.social_sync_controls s ON s.professional_id=p.id GROUP BY p.id,s.paused ORDER BY p.business_name LIMIT 200)x));
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_social_sync_settings(uuid,boolean,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_social_sync_overview() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.owner_social_sync_settings(uuid,boolean,text),beauty.owner_social_sync_overview() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_social_sync_settings(uuid,boolean,text),beauty.owner_social_sync_overview() TO beauty_app;
-- Notify once per expiry episode using the existing professional notification system.
CREATE FUNCTION beauty.social_reconnect_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.provider IN('instagram','tiktok') AND NEW.last_error='RECONNECT_REQUIRED' AND OLD.last_error IS DISTINCT FROM NEW.last_error THEN
 INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href,event_key)
 SELECT p.user_id,'professional_activity','Reconnect your '||CASE WHEN NEW.provider='instagram' THEN 'Instagram' ELSE 'TikTok' END||' portfolio','Your social permissions have expired or been removed. Reconnect if you want to keep importing your work. Bookings continue as usual.','/professional/connections','social-reconnect:'||NEW.id||':'||coalesce(NEW.last_success_at,NEW.created_at)::text FROM beauty.professional_profiles p WHERE p.id=NEW.professional_id ON CONFLICT DO NOTHING;
 END IF; RETURN NEW;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_notification_ops;
ALTER FUNCTION beauty.social_reconnect_notification() OWNER TO beauty_notification_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_notification_ops;
REVOKE ALL ON FUNCTION beauty.social_reconnect_notification() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER social_reconnect_notification AFTER UPDATE OF last_error ON beauty.business_connections FOR EACH ROW EXECUTE FUNCTION beauty.social_reconnect_notification();
-- Include the new professional choices in the existing token-free audit trail.
CREATE OR REPLACE FUNCTION beauty.audit_business_connection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN
 IF TG_OP='UPDATE' THEN IF OLD.status=NEW.status AND OLD.auto_publish=NEW.auto_publish AND OLD.export_bookings=NEW.export_bookings AND OLD.social_mode=NEW.social_mode AND OLD.sync_enabled=NEW.sync_enabled THEN RETURN NEW;END IF;END IF;
 SELECT u.id INTO actor FROM beauty.users u JOIN beauty.professional_profiles p ON p.user_id=u.id WHERE p.id=NEW.professional_id AND u.auth_id=beauty.auth_id() AND u.status='active';
 IF actor IS NOT NULL THEN INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,reason) VALUES(actor::text,'business_connection.'||NEW.provider||'.'||NEW.status,actor,'Connection status or sharing preference changed');END IF; RETURN NEW;
END $$;

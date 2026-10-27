-- Additive business tools. No financial calculations, fees or loading-screen changes.
ALTER TABLE beauty.reviews DROP CONSTRAINT reviews_body_check;
ALTER TABLE beauty.reviews ADD CONSTRAINT reviews_body_check CHECK(length(body)<=2000);
CREATE TABLE beauty.review_feedback (
 review_id uuid PRIMARY KEY REFERENCES beauty.reviews(id),
 answers jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(answers)='object' AND answers - ARRAY['quality','welcome','timing','expectations','result','recommend']::text[]='{}'::jsonb AND octet_length(answers::text)<=2048),
 private_suggestion text NOT NULL DEFAULT '' CHECK(length(private_suggestion)<=1000)
);
ALTER TABLE beauty.review_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.review_feedback FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.review_feedback FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON beauty.review_feedback TO beauty_app;
CREATE POLICY feedback_participant ON beauty.review_feedback FOR SELECT TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.reviews r WHERE r.id=review_id));
CREATE POLICY feedback_author ON beauty.review_feedback FOR INSERT TO beauty_app WITH CHECK(EXISTS(SELECT 1 FROM beauty.reviews r JOIN beauty.bookings b ON b.id=r.booking_id JOIN beauty.users u ON u.id=b.customer_id WHERE r.id=review_id AND u.auth_id=beauty.auth_id() AND u.status='active' AND b.status='completed'));

CREATE TABLE beauty.calendar_preferences (
 professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
 buffer_minutes smallint NOT NULL DEFAULT 0 CHECK(buffer_minutes IN(0,15,30)),
 travel_buffer_minutes smallint NOT NULL DEFAULT 0 CHECK(travel_buffer_minutes IN(0,15,30))
);
CREATE TABLE beauty.business_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 provider text NOT NULL CHECK(provider IN('google','outlook','ics','instagram','tiktok')),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
 secret_ciphertext text NOT NULL CHECK(length(secret_ciphertext)<=16000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','connected','error','disconnected')),
 auto_publish boolean NOT NULL DEFAULT false,export_bookings boolean NOT NULL DEFAULT false,
 last_success_at timestamptz,next_sync_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,
 last_error text CHECK(last_error IN('RECONNECT_REQUIRED','SYNC_FAILED','FEED_UNSUPPORTED','NOT_CONFIGURED')),
 successes integer NOT NULL DEFAULT 0,failures integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(professional_id,provider,label)
);
CREATE INDEX business_connections_due ON beauty.business_connections(next_sync_at) WHERE status<>'disconnected';
CREATE TABLE beauty.external_calendar_busy (
 connection_id uuid NOT NULL REFERENCES beauty.business_connections(id) ON DELETE CASCADE,
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 event_key text NOT NULL CHECK(length(event_key)<=256),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 PRIMARY KEY(connection_id,event_key)
);
CREATE INDEX external_busy_professional ON beauty.external_calendar_busy(professional_id,starts_at,ends_at);
CREATE TABLE beauty.calendar_exports (
 connection_id uuid NOT NULL REFERENCES beauty.business_connections(id) ON DELETE CASCADE,
 booking_id uuid NOT NULL REFERENCES beauty.bookings(id),event_id text NOT NULL,
 fingerprint text NOT NULL,PRIMARY KEY(connection_id,booking_id)
);
CREATE TABLE beauty.social_portfolio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 connection_id uuid REFERENCES beauty.business_connections(id) ON DELETE SET NULL,
 platform text NOT NULL CHECK(platform IN('instagram','tiktok')),external_id text NOT NULL CHECK(length(external_id)<=128),
 original_url text NOT NULL CHECK(length(original_url)<=500 AND original_url~'^https://(www\.)?(instagram\.com|tiktok\.com)/'),
 caption text NOT NULL DEFAULT '' CHECK(length(caption)<=1800),source_created_at timestamptz,
 publication_status text NOT NULL DEFAULT 'draft' CHECK(publication_status IN('draft','published','hidden','unavailable')),
 service_id uuid REFERENCES beauty.services(id),sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 10000),
 consent_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(professional_id,platform,external_id)
);
CREATE INDEX social_portfolio_service ON beauty.social_portfolio(service_id);
CREATE INDEX social_portfolio_connection ON beauty.social_portfolio(connection_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['calendar_preferences','business_connections','external_calendar_busy','social_portfolio'] LOOP
 EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.%I TO beauty_app',t);
 EXECUTE format('CREATE POLICY tools_owner ON beauty.%I TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status=''active'')) WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status=''active''))',t);
 END LOOP;
END $$;
ALTER TABLE beauty.calendar_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.calendar_exports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.calendar_exports FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.calendar_exports TO beauty_app;
CREATE POLICY exports_owner ON beauty.calendar_exports TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.business_connections c WHERE c.id=connection_id)) WITH CHECK(EXISTS(SELECT 1 FROM beauty.business_connections c JOIN beauty.bookings b ON b.professional_id=c.professional_id WHERE c.id=connection_id AND b.id=booking_id));
CREATE FUNCTION beauty.validate_business_content() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_TABLE_NAME='social_portfolio' THEN
 IF NEW.service_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.services s WHERE s.id=NEW.service_id AND s.professional_id=NEW.professional_id) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.connection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.business_connections c WHERE c.id=NEW.connection_id AND c.professional_id=NEW.professional_id) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_social_connection BEFORE INSERT OR UPDATE ON beauty.social_portfolio FOR EACH ROW EXECUTE FUNCTION beauty.validate_business_content();
CREATE TRIGGER validate_busy_connection BEFORE INSERT OR UPDATE ON beauty.external_calendar_busy FOR EACH ROW EXECUTE FUNCTION beauty.validate_business_content();
GRANT SELECT ON beauty.calendar_preferences,beauty.external_calendar_busy TO beauty_booking_ops;
GRANT SELECT(id,professional_id,provider,status,last_success_at) ON beauty.business_connections TO beauty_booking_ops;
CREATE POLICY calendar_preferences_booking ON beauty.calendar_preferences FOR SELECT TO beauty_booking_ops USING(true);
CREATE POLICY external_busy_booking ON beauty.external_calendar_busy FOR SELECT TO beauty_booking_ops USING(true);
CREATE POLICY calendar_connections_booking ON beauty.business_connections FOR SELECT TO beauty_booking_ops USING(true);
-- Keep the existing busy function as the underlying source; expand only blocked intervals.
ALTER FUNCTION beauty.booking_busy(uuid,timestamptz,timestamptz) RENAME TO booking_busy_before_business_tools;
CREATE FUNCTION beauty.booking_busy(target uuid,day_start timestamptz,day_end timestamptz) RETURNS TABLE(starts_at timestamptz,ends_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE padding interval; BEGIN
 IF day_end<=day_start OR day_end-day_start>interval '3 days' THEN RETURN; END IF;
 padding:=coalesce((SELECT (buffer_minutes+travel_buffer_minutes)*interval '1 minute' FROM beauty.calendar_preferences WHERE professional_id=target),interval '0');
 RETURN QUERY SELECT b.starts_at-padding,b.ends_at+padding FROM beauty.booking_busy_before_business_tools(target,day_start-padding,day_end+padding) b
 UNION ALL SELECT b.starts_at-padding,b.ends_at+padding FROM beauty.external_calendar_busy b JOIN beauty.business_connections c ON c.id=b.connection_id WHERE b.professional_id=target AND c.status<>'disconnected' AND b.starts_at<day_end+padding AND b.ends_at>day_start-padding;
 -- Stale or failed connections must not silently be treated as synchronised.
 IF EXISTS(SELECT 1 FROM beauty.business_connections c WHERE c.professional_id=target AND c.provider IN('google','outlook','ics') AND c.status<>'disconnected' AND (c.status<>'connected' OR c.last_success_at IS NULL OR c.last_success_at<now()-interval '10 minutes')) THEN RETURN QUERY SELECT day_start,day_end; END IF;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.booking_busy(uuid,timestamptz,timestamptz) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.booking_busy(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.booking_busy(uuid,timestamptz,timestamptz) TO beauty_app,beauty_catalog;
-- Protect reservations and reschedules in the same professional lock used by existing booking functions.
CREATE FUNCTION beauty.business_tools_booking_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE padding interval; BEGIN
 IF NEW.status NOT IN('confirmed','payment_pending') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN IF NEW.starts_at=OLD.starts_at AND NEW.ends_at=OLD.ends_at AND NEW.professional_id=OLD.professional_id THEN RETURN NEW; END IF; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.professional_id::text,0));
 padding:=coalesce((SELECT (buffer_minutes+travel_buffer_minutes)*interval '1 minute' FROM beauty.calendar_preferences WHERE professional_id=NEW.professional_id),interval '0');
 -- Professionals who have not enabled these tools retain the existing booking guards.
 IF padding=interval '0' AND NOT EXISTS(SELECT 1 FROM beauty.business_connections c WHERE c.professional_id=NEW.professional_id AND c.provider IN('google','outlook','ics') AND c.status<>'disconnected') THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM beauty.business_connections c WHERE c.professional_id=NEW.professional_id AND c.provider IN('google','outlook','ics') AND c.status<>'disconnected' AND (c.status<>'connected' OR c.last_success_at IS NULL OR c.last_success_at<now()-interval '10 minutes')) THEN RAISE EXCEPTION 'CALENDAR_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.professional_id=NEW.professional_id AND b.id<>NEW.id AND (b.status='confirmed' OR(b.status='payment_pending' AND b.hold_expires_at>now())) AND b.starts_at-padding<NEW.ends_at AND b.ends_at+padding>NEW.starts_at)
 OR EXISTS(SELECT 1 FROM beauty.availability_blocks b WHERE b.professional_id=NEW.professional_id AND b.starts_at-padding<NEW.ends_at AND b.ends_at+padding>NEW.starts_at)
 OR EXISTS(SELECT 1 FROM beauty.external_calendar_busy b JOIN beauty.business_connections c ON c.id=b.connection_id WHERE b.professional_id=NEW.professional_id AND c.status<>'disconnected' AND b.starts_at-padding<NEW.ends_at AND b.ends_at+padding>NEW.starts_at) THEN RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE='23P01'; END IF;
 RETURN NEW;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.business_tools_booking_guard() OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.business_tools_booking_guard() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER business_tools_booking_guard BEFORE INSERT OR UPDATE OF starts_at,ends_at,professional_id ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.business_tools_booking_guard();
GRANT SELECT ON beauty.social_portfolio TO beauty_catalog;
CREATE POLICY social_public ON beauty.social_portfolio FOR SELECT TO beauty_catalog USING(publication_status='published' AND consent_at IS NOT NULL AND EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE VIEW beauty.public_social_portfolio WITH(security_barrier=true) AS
 SELECT s.id,s.professional_id,s.platform,s.original_url,s.caption,s.source_created_at,s.sort_order,p.slug,p.business_name,p.category,svc.id AS service_id,svc.name AS service_name,svc.from_price_pence AS price_pence
 FROM beauty.social_portfolio s JOIN beauty.public_professionals p ON p.id=s.professional_id LEFT JOIN beauty.public_services svc ON svc.id=s.service_id AND svc.professional_id=s.professional_id;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_social_portfolio OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
REVOKE ALL ON beauty.public_social_portfolio FROM PUBLIC,anon,authenticated;
GRANT SELECT ON beauty.public_social_portfolio TO beauty_app;
-- The existing server worker can discover due owner identities, never token values.
CREATE FUNCTION beauty.due_business_connections() RETURNS TABLE(auth_id text,professional_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT u.auth_id::text,c.professional_id FROM beauty.business_connections c JOIN beauty.professional_profiles p ON p.id=c.professional_id JOIN beauty.users u ON u.id=p.user_id
 WHERE c.status<>'disconnected' AND c.next_sync_at<=now() AND (c.lease_until IS NULL OR c.lease_until<now()) AND u.status='active' GROUP BY u.auth_id,c.professional_id ORDER BY min(c.next_sync_at) LIMIT 2
$$;
-- This function owns no mutation privileges and returns only internal routing IDs.
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.due_business_connections() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.due_business_connections() FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.due_business_connections() TO beauty_payment_worker;
GRANT SELECT(id,professional_id,provider,status,last_success_at,next_sync_at,lease_until,successes,failures) ON beauty.business_connections TO beauty_admin_ops;
CREATE POLICY connections_admin_read ON beauty.business_connections FOR SELECT TO beauty_admin_ops USING(true);
CREATE FUNCTION beauty.admin_business_tools_health() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_admin();
 RETURN (SELECT jsonb_build_object('connections',coalesce(jsonb_agg(x),'[]'::jsonb)) FROM (SELECT provider,status,count(*) AS accounts,sum(successes) AS successes,sum(failures) AS failures,min(last_success_at) AS oldest_success FROM beauty.business_connections GROUP BY provider,status)x);
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_business_tools_health() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.admin_business_tools_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.admin_business_tools_health() TO beauty_app;
CREATE FUNCTION beauty.service_calendar_owner(target uuid) RETURNS TABLE(auth_id text,professional_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT u.auth_id::text,p.id FROM beauty.services s JOIN beauty.professional_profiles p ON p.id=s.professional_id JOIN beauty.users u ON u.id=p.user_id
 WHERE s.id=target AND s.active AND s.publication_status='published' AND p.publication_status='published' AND u.status='active' AND EXISTS(SELECT 1 FROM beauty.business_connections c WHERE c.professional_id=p.id AND c.provider IN('google','outlook','ics') AND c.status<>'disconnected')
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.service_calendar_owner(uuid) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.service_calendar_owner(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.service_calendar_owner(uuid) TO beauty_payment_worker;
CREATE OR REPLACE FUNCTION beauty.policy_reschedule_busy(target uuid,day_start timestamptz,day_end timestamptz) RETURNS TABLE(starts_at timestamptz,ends_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid;padding interval; BEGIN
 PERFORM beauty.policy_booking_actor(target);
 IF day_end<=day_start OR day_end-day_start>interval '3 days' THEN RETURN; END IF;
 SELECT professional_id INTO pro FROM beauty.bookings WHERE id=target;
 padding:=coalesce((SELECT (buffer_minutes+travel_buffer_minutes)*interval '1 minute' FROM beauty.calendar_preferences WHERE professional_id=pro),interval '0');
 RETURN QUERY SELECT b.starts_at-padding,b.ends_at+padding FROM beauty.bookings b WHERE b.professional_id=pro AND b.id<>target AND b.starts_at-padding<day_end AND b.ends_at+padding>day_start AND (b.status='confirmed' OR(b.status='payment_pending' AND b.hold_expires_at>now()))
 UNION ALL SELECT a.starts_at-padding,a.ends_at+padding FROM beauty.availability_blocks a WHERE a.professional_id=pro AND a.starts_at-padding<day_end AND a.ends_at+padding>day_start
 UNION ALL SELECT b.starts_at-padding,b.ends_at+padding FROM beauty.external_calendar_busy b JOIN beauty.business_connections c ON c.id=b.connection_id WHERE b.professional_id=pro AND c.status<>'disconnected' AND b.starts_at-padding<day_end AND b.ends_at+padding>day_start;
 IF EXISTS(SELECT 1 FROM beauty.business_connections c WHERE c.professional_id=pro AND c.provider IN('google','outlook','ics') AND c.status<>'disconnected' AND (c.status<>'connected' OR c.last_success_at IS NULL OR c.last_success_at<now()-interval '10 minutes')) THEN RETURN QUERY SELECT day_start,day_end; END IF;
END $$;
CREATE FUNCTION beauty.audit_business_connection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN
 IF TG_OP='UPDATE' THEN IF OLD.status=NEW.status AND OLD.auto_publish=NEW.auto_publish AND OLD.export_bookings=NEW.export_bookings THEN RETURN NEW;END IF;END IF;
 SELECT u.id INTO actor FROM beauty.users u JOIN beauty.professional_profiles p ON p.user_id=u.id WHERE p.id=NEW.professional_id AND u.auth_id=beauty.auth_id() AND u.status='active';
 IF actor IS NOT NULL THEN INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,reason) VALUES(actor::text,'business_connection.'||NEW.provider||'.'||NEW.status,actor,'Connection status or sharing preference changed');END IF;
 RETURN NEW;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.audit_business_connection() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.audit_business_connection() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER audit_business_connection AFTER INSERT OR UPDATE ON beauty.business_connections FOR EACH ROW EXECUTE FUNCTION beauty.audit_business_connection();
CREATE TABLE beauty.review_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL UNIQUE REFERENCES beauty.reviews(id),
 blob_path text NOT NULL CHECK(length(blob_path)<=500 AND blob_path LIKE 'reviews/%'),
 alt_text text NOT NULL CHECK(length(alt_text) BETWEEN 3 AND 200),consent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beauty.review_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.review_photos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.review_photos FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON beauty.review_photos TO beauty_app;
CREATE POLICY review_photo_participant ON beauty.review_photos FOR SELECT TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.reviews r WHERE r.id=review_id));
CREATE POLICY review_photo_author ON beauty.review_photos FOR INSERT TO beauty_app WITH CHECK(EXISTS(SELECT 1 FROM beauty.reviews r JOIN beauty.bookings b ON b.id=r.booking_id JOIN beauty.users u ON u.id=b.customer_id WHERE r.id=review_id AND u.auth_id=beauty.auth_id() AND u.status='active' AND b.status='completed'));
GRANT SELECT ON beauty.review_photos TO beauty_catalog;
CREATE POLICY review_photo_public ON beauty.review_photos FOR SELECT TO beauty_catalog USING(EXISTS(SELECT 1 FROM beauty.reviews r WHERE r.id=review_id));
CREATE VIEW beauty.public_review_photos WITH(security_barrier=true) AS SELECT p.id,p.review_id,p.blob_path,p.alt_text FROM beauty.review_photos p JOIN beauty.public_reviews r ON r.id=p.review_id;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_review_photos OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
REVOKE ALL ON beauty.public_review_photos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON beauty.public_review_photos TO beauty_app;
GRANT UPDATE(next_sync_at),SELECT(export_bookings) ON beauty.business_connections TO beauty_booking_ops;
CREATE POLICY calendar_connections_queue ON beauty.business_connections FOR UPDATE TO beauty_booking_ops USING(true) WITH CHECK(true);
CREATE FUNCTION beauty.queue_business_calendar_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE beauty.business_connections SET next_sync_at=now() WHERE professional_id=NEW.professional_id AND provider IN('google','outlook') AND export_bookings AND status<>'disconnected';
 RETURN NEW;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.queue_business_calendar_sync() OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.queue_business_calendar_sync() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER queue_business_calendar_sync AFTER INSERT OR UPDATE OF status,starts_at,ends_at ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.queue_business_calendar_sync();

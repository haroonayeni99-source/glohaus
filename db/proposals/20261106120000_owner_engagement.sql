-- Prepared additive migration. NOT part of the production migration plan yet.
-- Release gate: verify a restorable production backup, stage this exact SQL,
-- validate role isolation/retention, then move into db/migrations before activation.
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
CREATE SCHEMA glohaus_analytics;
REVOKE ALL ON SCHEMA glohaus_analytics FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA glohaus_analytics TO beauty_admin_ops;
CREATE TABLE glohaus_analytics.visits (
 id uuid PRIMARY KEY, visitor uuid NOT NULL, session uuid NOT NULL,
 page text NOT NULL CHECK(page IN ('home','discover','shop','product','profile','service','registration','booking','checkout')),
 device text NOT NULL CHECK(device IN ('mobile','tablet','desktop')),
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 10000),
 active_ms integer NOT NULL CHECK(active_ms BETWEEN 0 AND 14400000),
 scroll integer NOT NULL CHECK(scroll BETWEEN 0 AND 100),
 clicks jsonb NOT NULL CHECK(jsonb_typeof(clicks)='object'),
 videos jsonb NOT NULL CHECK(jsonb_typeof(videos)='array'),
 first_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 conversion text CHECK(conversion IN ('booking','purchase')),
 conversion_key text UNIQUE CHECK(conversion_key IS NULL OR conversion_key ~ '^[a-f0-9]{64}$')
);
CREATE INDEX engagement_visits_first ON glohaus_analytics.visits(first_at);
CREATE INDEX engagement_visits_session ON glohaus_analytics.visits(session,first_at);
CREATE INDEX engagement_visits_visitor ON glohaus_analytics.visits(visitor,first_at);
ALTER TABLE glohaus_analytics.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE glohaus_analytics.visits FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_operations ON glohaus_analytics.visits TO beauty_admin_ops USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON glohaus_analytics.visits TO beauty_admin_ops;
-- No raw table grants to beauty_app, browser roles or delegated administrators.
CREATE FUNCTION beauty.engagement_ready() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION beauty.engagement_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.engagement_ready() TO beauty_app;
CREATE FUNCTION beauty.ingest_engagement(payload jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing glohaus_analytics.visits%ROWTYPE; vid uuid; item jsonb; k text; n jsonb;
BEGIN
 -- Validate at the database boundary as well as at HTTP ingestion. No free text.
 IF jsonb_typeof(payload)<>'object' OR payload - ARRAY['id','visitor','session','page','device','sequence','activeMs','scroll','clicks','videos'] <> '{}'::jsonb
 OR jsonb_typeof(payload->'clicks')<>'object' OR jsonb_typeof(payload->'videos')<>'array'
 OR jsonb_array_length(payload->'videos')>100 THEN RETURN false; END IF;
 IF payload->>'page' NOT IN ('home','discover','shop','product','profile','service','registration','booking','checkout')
 OR payload->>'device' NOT IN ('mobile','tablet','desktop') THEN RETURN false; END IF;
 FOR k,n IN SELECT * FROM jsonb_each(payload->'clicks') LOOP
  IF k NOT IN ('home','discover','shop','profile','service','registration','booking','checkout','search','filter','video_play','video_pause','video_sound','add_to_cart')
  OR jsonb_typeof(n)<>'number' OR n::text !~ '^[0-9]{1,4}$' OR n::integer>1000 THEN RETURN false; END IF;
 END LOOP;
 IF payload->>'page'<>'discover' AND jsonb_array_length(payload->'videos')>0 THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(payload->'videos') LOOP
  IF item - ARRAY['id','impressions','watchMs','starts','completions','replays'] <> '{}'::jsonb
  OR (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR NOT (item ?& ARRAY['id','impressions','watchMs','starts','completions','replays']) THEN RETURN false; END IF;
  FOR k,n IN SELECT * FROM jsonb_each(item-'id') LOOP
   IF jsonb_typeof(n)<>'number' OR n::text !~ '^[0-9]{1,8}$' OR n::integer<0
   OR n::integer>(CASE WHEN k='watchMs' THEN 14400000 WHEN k='impressions' THEN 1 ELSE 1000 END) THEN RETURN false;END IF;
  END LOOP;
 END LOOP;
 IF (SELECT coalesce(sum((v->>'watchMs')::bigint),0) FROM jsonb_array_elements(payload->'videos') v)>(payload->>'activeMs')::bigint+5000 THEN RETURN false;END IF;
 vid:=(payload->>'visitor')::uuid;
 -- Serialize visitor writes; cap growth without storing an IP address.
 PERFORM pg_advisory_xact_lock(hashtextextended(vid::text,193));
 SELECT * INTO existing FROM glohaus_analytics.visits WHERE id=(payload->>'id')::uuid FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  IF existing.visitor<>vid OR existing.session<>(payload->>'session')::uuid OR existing.page<>payload->>'page' OR existing.device<>payload->>'device'
   OR existing.first_at<clock_timestamp()-interval '4 hours' THEN RETURN false; END IF;
  IF existing.sequence>=(payload->>'sequence')::integer THEN RETURN true;END IF;
  IF (payload->>'activeMs')::integer < existing.active_ms
   OR (payload->>'activeMs')::integer>existing.active_ms+greatest(0,extract(epoch FROM clock_timestamp()-existing.last_at)*1000)+2500 THEN RETURN false; END IF;
 ELSE
  IF (payload->>'activeMs')::integer>2500 OR (SELECT count(*) FROM glohaus_analytics.visits WHERE visitor=vid AND first_at>clock_timestamp()-interval '1 minute')>=30
   OR (SELECT count(*) FROM glohaus_analytics.visits WHERE visitor=vid AND first_at>clock_timestamp()-interval '1 day')>=1000 THEN RETURN false; END IF;
 END IF;
 INSERT INTO glohaus_analytics.visits(id,visitor,session,page,device,sequence,active_ms,scroll,clicks,videos)
 VALUES((payload->>'id')::uuid,vid,(payload->>'session')::uuid,payload->>'page',payload->>'device',(payload->>'sequence')::integer,(payload->>'activeMs')::integer,(payload->>'scroll')::integer,payload->'clicks',payload->'videos')
 ON CONFLICT(id) DO UPDATE SET sequence=EXCLUDED.sequence,active_ms=EXCLUDED.active_ms,scroll=greatest(glohaus_analytics.visits.scroll,EXCLUDED.scroll),clicks=EXCLUDED.clicks,videos=EXCLUDED.videos,last_at=clock_timestamp();
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN false;
END $$;
ALTER FUNCTION beauty.ingest_engagement(jsonb) OWNER TO beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.ingest_engagement(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.ingest_engagement(jsonb) TO beauty_app;
CREATE FUNCTION beauty.owner_engagement_rows(starts timestamptz,ends timestamptz,device_filter text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_owner();
 IF starts IS NULL OR ends IS NULL OR ends<=starts OR ends-starts>interval '94 days' OR device_filter NOT IN ('all','mobile','tablet','desktop') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'visitor',visitor,'session',session,'page',page,'device',device,'sequence',sequence,'activeMs',active_ms,'scroll',scroll,'clicks',clicks,'videos',videos,'firstAt',first_at,'lastAt',last_at,'conversion',conversion) ORDER BY first_at,id)
 FROM (SELECT * FROM glohaus_analytics.visits WHERE first_at>=starts AND first_at<ends AND first_at>=clock_timestamp()-interval '90 days' AND (device_filter='all' OR device=device_filter) ORDER BY first_at,id LIMIT 10001) rows),'[]'::jsonb);
END $$;
ALTER FUNCTION beauty.owner_engagement_rows(timestamptz,timestamptz,text) OWNER TO beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.owner_engagement_rows(timestamptz,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.owner_engagement_rows(timestamptz,timestamptz,text) TO beauty_app;
-- Retention is independently scheduled, never attached to a payment transaction.
CREATE FUNCTION beauty.prune_engagement() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE removed integer;
BEGIN PERFORM beauty.require_owner(); DELETE FROM glohaus_analytics.visits WHERE first_at<clock_timestamp()-interval '89 days';GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;END $$;
ALTER FUNCTION beauty.prune_engagement() OWNER TO beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.prune_engagement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.prune_engagement() TO beauty_app;

CREATE FUNCTION beauty.verify_engagement_conversion(visit_id uuid,kind text,reference_id uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE visit glohaus_analytics.visits%ROWTYPE; actor uuid; ref uuid; proof text;
BEGIN
 SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';
 IF actor IS NULL OR kind NOT IN ('booking','purchase') THEN RETURN false;END IF;
 SELECT * INTO visit FROM glohaus_analytics.visits WHERE id=visit_id FOR UPDATE;
 IF visit.id IS NULL OR visit.first_at<clock_timestamp()-interval '1 hour' OR visit.page NOT IN ('service','checkout') THEN RETURN false;END IF;
 IF kind='booking' AND visit.page='service' THEN
  SELECT b.id INTO ref FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
   WHERE b.id=reference_id AND b.customer_id=actor AND b.created_at>=visit.first_at-interval '5 seconds'
    AND b.status IN ('confirmed','completed') AND p.status='paid' AND p.captured_pence>0 AND p.refunded_pence=0;
 ELSIF kind='purchase' AND visit.page='checkout' THEN
  SELECT o.checkout_reference INTO ref FROM beauty.product_orders o
   WHERE o.customer_id=actor AND o.created_at>=visit.first_at-interval '5 seconds' AND o.status IN ('paid','processing','shipped','delivered')
   ORDER BY o.created_at DESC LIMIT 1;
 END IF;
 IF ref IS NULL THEN RETURN false;END IF;
 proof:=encode(sha256(convert_to(kind||ref::text,'UTF8')),'hex');
 IF EXISTS(SELECT 1 FROM glohaus_analytics.visits WHERE conversion_key=proof) THEN RETURN true;END IF;
 UPDATE glohaus_analytics.visits SET conversion=kind,conversion_key=proof WHERE id=visit_id;
 RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN true;
END $$;
ALTER FUNCTION beauty.verify_engagement_conversion(uuid,text,uuid) OWNER TO beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.verify_engagement_conversion(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.verify_engagement_conversion(uuid,text,uuid) TO beauty_app;
CREATE FUNCTION beauty.run_engagement_retention() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE removed integer;
BEGIN DELETE FROM glohaus_analytics.visits WHERE first_at<clock_timestamp()-interval '89 days';GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;END $$;
ALTER FUNCTION beauty.run_engagement_retention() OWNER TO beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.run_engagement_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.run_engagement_retention() TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;

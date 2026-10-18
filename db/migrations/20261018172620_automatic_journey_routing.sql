-- Optional server-side routing. No provider calls or billing are enabled by migration.
ALTER TABLE beauty.arrival_settings
 ADD COLUMN routing_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN routing_daily_limit integer NOT NULL DEFAULT 100 CHECK(routing_daily_limit BETWEEN 1 AND 10000),
 ADD COLUMN routing_monthly_limit integer NOT NULL DEFAULT 3000 CHECK(routing_monthly_limit BETWEEN 1 AND 100000),
 ADD COLUMN routing_refresh_minutes integer NOT NULL DEFAULT 15 CHECK(routing_refresh_minutes BETWEEN 5 AND 60),
 ADD COLUMN routing_change_minutes integer NOT NULL DEFAULT 5 CHECK(routing_change_minutes BETWEEN 3 AND 30);
CREATE TABLE beauty.journey_routing_usage (
 day date PRIMARY KEY, requests integer NOT NULL DEFAULT 0 CHECK(requests>=0), failures integer NOT NULL DEFAULT 0 CHECK(failures>=0)
);
CREATE TABLE beauty.appointment_journey_routes (
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id) ON DELETE CASCADE,
 origin_ciphertext text CHECK(length(origin_ciphertext)<=2500), auto_refresh boolean NOT NULL DEFAULT false,
 plan_revision integer NOT NULL DEFAULT 0, location_version integer NOT NULL, planned_starts_at timestamptz NOT NULL,
 request_token uuid, claim_until timestamptz, requested_at timestamptz NOT NULL DEFAULT now(),
 next_refresh_at timestamptz, checked_at timestamptz, last_notified_at timestamptz,
 last_error text CHECK(last_error IN('ROUTE_NOT_FOUND','ROUTE_PROVIDER_UNAVAILABLE','ROUTE_PROVIDER_LIMIT','ROUTE_ORIGIN_UNAVAILABLE'))
);
CREATE INDEX appointment_journey_routes_due ON beauty.appointment_journey_routes(next_refresh_at) WHERE auto_refresh;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['journey_routing_usage','appointment_journey_routes'] LOOP
  EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.%I TO beauty_booking_ops',t);
  EXECUTE format('CREATE POLICY routing_internal ON beauty.%I FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
-- One settings lock serializes both budget checks across API and worker calls.
-- A reserved call counts even on provider failure; no optimistic overspending.
CREATE FUNCTION beauty.spend_journey_routing_request() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s beauty.arrival_settings; total integer; BEGIN
 SELECT * INTO s FROM beauty.arrival_settings FOR UPDATE;
 IF NOT(s.routing_enabled AND s.journey_planner) THEN RETURN false; END IF;
 INSERT INTO beauty.journey_routing_usage(day) VALUES((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING;
 SELECT coalesce(sum(requests),0) INTO total FROM beauty.journey_routing_usage WHERE day>=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
 IF total>=s.routing_monthly_limit THEN RETURN false; END IF;
 UPDATE beauty.journey_routing_usage SET requests=requests+1 WHERE day=(now() AT TIME ZONE 'UTC')::date AND requests<s.routing_daily_limit;
 RETURN FOUND;
END $$;
CREATE FUNCTION beauty.customer_journey_route(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb:=beauty.policy_booking_actor(target); BEGIN
 IF (identity->>'professional')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('enabled',(SELECT routing_enabled AND journey_planner FROM beauty.arrival_settings),
 'automaticUpdates',coalesce((SELECT r.auto_refresh FROM beauty.appointment_journey_routes r JOIN beauty.appointment_journey_plans j ON j.booking_id=r.booking_id JOIN beauty.bookings b ON b.id=r.booking_id JOIN beauty.appointment_arrivals a ON a.booking_id=b.id WHERE r.booking_id=target AND b.status='confirmed' AND b.starts_at=r.planned_starts_at AND a.version=r.location_version AND j.revision=r.plan_revision AND j.departure_at>now()),false),
 'checkedAt',(SELECT checked_at FROM beauty.appointment_journey_routes r JOIN beauty.appointment_journey_plans j ON j.booking_id=r.booking_id WHERE r.booking_id=target AND r.plan_revision=j.revision),
 'lastError',(SELECT last_error FROM beauty.appointment_journey_routes WHERE booking_id=target));
END $$;
CREATE FUNCTION beauty.reserve_customer_journey_route(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb:=beauty.policy_booking_actor(target); b beauty.bookings; a beauty.appointment_arrivals; j beauty.appointment_journey_plans; r beauty.appointment_journey_routes; token uuid:=gen_random_uuid(); BEGIN
 IF (identity->>'professional')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM beauty.bookings WHERE id=target FOR UPDATE;
 SELECT * INTO a FROM beauty.appointment_arrivals WHERE booking_id=target;
 SELECT * INTO j FROM beauty.appointment_journey_plans WHERE booking_id=target;
 IF b.status<>'confirmed' OR b.starts_at<=now() OR b.starts_at>now()+interval '90 days' OR a.booking_id IS NULL OR NOT(SELECT routing_enabled AND journey_planner FROM beauty.arrival_settings) THEN RAISE EXCEPTION 'ROUTING_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM beauty.appointment_journey_routes WHERE booking_id=target;
 IF r.requested_at>now()-interval '30 seconds' OR r.claim_until>now() THEN RAISE EXCEPTION 'ROUTE_RATE_LIMIT' USING ERRCODE='22023'; END IF;
 IF NOT beauty.spend_journey_routing_request() THEN RAISE EXCEPTION 'ROUTE_BUDGET_LIMIT' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.appointment_journey_routes(booking_id,plan_revision,location_version,planned_starts_at,request_token,claim_until,requested_at)
 VALUES(target,coalesce(j.revision,0),a.version,b.starts_at,token,now()+interval '2 minutes',now())
 ON CONFLICT(booking_id) DO UPDATE SET plan_revision=excluded.plan_revision,location_version=excluded.location_version,planned_starts_at=excluded.planned_starts_at,request_token=token,claim_until=excluded.claim_until,requested_at=now();
 RETURN jsonb_build_object('bookingId',target,'token',token,'startsAt',b.starts_at,'latitude',a.latitude,'longitude',a.longitude,'departureAt',j.departure_at,'durationMinutes',j.duration_minutes,'bufferMinutes',j.buffer_minutes,'mode',j.mode);
END $$;
-- Runs even when routing credentials or provider billing are unavailable.
CREATE FUNCTION beauty.cleanup_journey_routes() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE beauty.appointment_journey_routes r SET origin_ciphertext=NULL,auto_refresh=false,request_token=NULL,claim_until=NULL
 WHERE (r.origin_ciphertext IS NOT NULL OR r.auto_refresh OR r.request_token IS NOT NULL) AND (
 NOT(SELECT routing_enabled AND journey_planner AND departure_reminders FROM beauty.arrival_settings)
 OR NOT EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.appointment_arrivals a ON a.booking_id=b.id JOIN beauty.appointment_journey_plans j ON j.booking_id=b.id WHERE b.id=r.booking_id AND b.status='confirmed' AND b.starts_at=r.planned_starts_at AND a.version=r.location_version AND j.revision=r.plan_revision AND j.reminders AND j.departure_at>now())
 ) AND (r.claim_until IS NULL OR r.claim_until<=now());
 DELETE FROM beauty.appointment_journey_routes r USING beauty.bookings b WHERE b.id=r.booking_id AND b.ends_at<now()-interval '1 day';
 DELETE FROM beauty.journey_routing_usage WHERE day<(now() AT TIME ZONE 'UTC')::date-100;
END $$;
CREATE FUNCTION beauty.claim_journey_route_refreshes() RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate record; token uuid; BEGIN
 FOR candidate IN SELECT b.id FROM beauty.bookings b JOIN beauty.appointment_journey_plans j ON j.booking_id=b.id JOIN beauty.appointment_journey_routes r ON r.booking_id=b.id JOIN beauty.appointment_arrivals a ON a.booking_id=b.id CROSS JOIN beauty.arrival_settings s
 WHERE s.routing_enabled AND s.journey_planner AND s.departure_reminders AND s.scheduler_tick_at>now()-interval '2 minutes'
 AND r.auto_refresh AND r.origin_ciphertext IS NOT NULL AND r.next_refresh_at<=now() AND (r.claim_until IS NULL OR r.claim_until<=now()) AND r.requested_at<now()-interval '30 seconds'
 AND b.status='confirmed' AND b.starts_at=r.planned_starts_at AND a.version=r.location_version AND j.revision=r.plan_revision AND j.reminders AND j.departure_at>now() AND j.departure_at<=now()+interval '3 hours'
 ORDER BY r.next_refresh_at LIMIT 5 FOR UPDATE OF b SKIP LOCKED LOOP
  IF NOT beauty.spend_journey_routing_request() THEN EXIT; END IF;
  token:=gen_random_uuid();
  UPDATE beauty.appointment_journey_routes SET request_token=token,claim_until=now()+interval '2 minutes',requested_at=now() WHERE booking_id=candidate.id;
  RETURN QUERY SELECT jsonb_build_object('bookingId',b.id,'token',token,'startsAt',b.starts_at,'latitude',a.latitude,'longitude',a.longitude,'departureAt',j.departure_at,'durationMinutes',j.duration_minutes,'bufferMinutes',j.buffer_minutes,'mode',j.mode,'ciphertext',r.origin_ciphertext)
  FROM beauty.bookings b JOIN beauty.appointment_arrivals a ON a.booking_id=b.id JOIN beauty.appointment_journey_plans j ON j.booking_id=b.id JOIN beauty.appointment_journey_routes r ON r.booking_id=b.id WHERE b.id=candidate.id;
 END LOOP;
END $$;
-- Authoritative completion uses the saved booking/version/plan lease, never
-- a destination, booking time, revision or origin supplied by a customer.
CREATE FUNCTION beauty.finish_journey_route(target uuid,token uuid,payload jsonb,ciphertext text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b beauty.bookings; a beauty.appointment_arrivals; j beauty.appointment_journey_plans; r beauty.appointment_journey_routes; s beauty.arrival_settings;
 duration integer; buffer integer; next_revision integer; changed boolean; automatic boolean; notify boolean; BEGIN
 SELECT * INTO b FROM beauty.bookings WHERE id=target FOR UPDATE;
 SELECT * INTO a FROM beauty.appointment_arrivals WHERE booking_id=target;
 SELECT * INTO j FROM beauty.appointment_journey_plans WHERE booking_id=target;
 SELECT * INTO r FROM beauty.appointment_journey_routes WHERE booking_id=target;
 SELECT * INTO s FROM beauty.arrival_settings;
 IF r.request_token IS DISTINCT FROM token OR r.claim_until<=now() OR b.status<>'confirmed' OR b.starts_at<=now() OR b.starts_at IS DISTINCT FROM r.planned_starts_at OR a.version IS DISTINCT FROM r.location_version OR coalesce(j.revision,0)<>r.plan_revision OR NOT(s.routing_enabled AND s.journey_planner) THEN RAISE EXCEPTION 'ROUTE_CHANGED' USING ERRCODE='22023'; END IF;
 IF payload ? 'error' THEN
  UPDATE beauty.appointment_journey_routes SET last_error=payload->>'error',request_token=NULL,claim_until=NULL,next_refresh_at=now()+s.routing_refresh_minutes*interval '1 minute',auto_refresh=CASE WHEN payload->>'error'='ROUTE_ORIGIN_UNAVAILABLE' THEN false ELSE auto_refresh END,origin_ciphertext=CASE WHEN payload->>'error'='ROUTE_ORIGIN_UNAVAILABLE' THEN NULL ELSE origin_ciphertext END WHERE booking_id=target;
  UPDATE beauty.journey_routing_usage SET failures=failures+1 WHERE day=(now() AT TIME ZONE 'UTC')::date;
  RETURN;
 END IF;
 duration:=(payload->>'durationMinutes')::int;buffer:=(payload->>'bufferMinutes')::int;automatic:=coalesce((payload->>'automaticUpdates')::boolean,false);
 IF duration IS NULL OR duration NOT BETWEEN 1 AND 1440 OR buffer IS NULL OR buffer NOT BETWEEN 0 AND 120 OR payload->>'mode' NOT IN('driving','transit','walking','bicycling') OR payload->>'mode' IS NULL OR payload->>'reminders' IS NULL OR ((payload->>'reminders')::boolean AND NOT s.departure_reminders) OR (automatic AND (ciphertext IS NULL OR ciphertext NOT LIKE 'v1.%' OR length(ciphertext)>2500 OR NOT (payload->>'reminders')::boolean)) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 changed:=j.booking_id IS NULL OR j.duration_minutes<>duration OR j.buffer_minutes<>buffer OR j.mode<>payload->>'mode' OR j.reminders IS DISTINCT FROM (payload->>'reminders')::boolean;
 next_revision:=coalesce(j.revision,0)+CASE WHEN changed THEN 1 ELSE 0 END;
 notify:=j.booking_id IS NOT NULL AND automatic AND j.reminders AND duration-j.duration_minutes>=greatest(s.routing_change_minutes,ceil(j.duration_minutes*0.2)::int) AND (r.last_notified_at IS NULL OR r.last_notified_at<now()-interval '30 minutes');
 IF changed THEN
  INSERT INTO beauty.appointment_journey_plans(booking_id,duration_minutes,buffer_minutes,mode,reminders,departure_at,planned_starts_at,location_version,revision)
  VALUES(target,duration,buffer,payload->>'mode',(payload->>'reminders')::boolean,b.starts_at-(duration+buffer)*interval '1 minute',b.starts_at,a.version,next_revision)
  ON CONFLICT(booking_id) DO UPDATE SET duration_minutes=excluded.duration_minutes,buffer_minutes=excluded.buffer_minutes,mode=excluded.mode,reminders=excluded.reminders,departure_at=excluded.departure_at,planned_starts_at=excluded.planned_starts_at,location_version=excluded.location_version,revision=excluded.revision,updated_at=now();
  INSERT INTO beauty.appointment_arrival_events(booking_id,actor_id,kind,details)
  VALUES(target,(SELECT id FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active'),'plan_saved',jsonb_build_object('source','google_routes','automaticUpdates',automatic));
 END IF;
 UPDATE beauty.appointment_journey_routes SET plan_revision=next_revision,origin_ciphertext=CASE WHEN automatic AND b.starts_at-(duration+buffer)*interval '1 minute'>now() THEN ciphertext ELSE NULL END,
 auto_refresh=automatic AND b.starts_at-(duration+buffer)*interval '1 minute'>now(),checked_at=now(),last_error=NULL,request_token=NULL,claim_until=NULL,next_refresh_at=now()+s.routing_refresh_minutes*interval '1 minute',last_notified_at=CASE WHEN notify THEN now() ELSE r.last_notified_at END WHERE booking_id=target;
 IF notify THEN
  PERFORM beauty.arrival_notify(target,b.customer_id,'Your journey estimate has changed','Your selected route now needs more time. Open your appointment to check the revised departure time and current directions. Estimates can change; no lateness penalty or cancellation has been applied.','departure:'||target||':'||next_revision||':change',true);
 END IF;
END $$;
CREATE FUNCTION beauty.save_customer_journey_route(target uuid,token uuid,payload jsonb,ciphertext text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb:=beauty.policy_booking_actor(target); BEGIN
 IF (identity->>'professional')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM beauty.finish_journey_route(target,token,payload,ciphertext);
 RETURN beauty.appointment_arrival(target);
END $$;
CREATE FUNCTION beauty.stop_customer_route_refresh(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb:=beauty.policy_booking_actor(target); BEGIN
 IF (identity->>'professional')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM beauty.bookings WHERE id=target FOR UPDATE;
 UPDATE beauty.appointment_journey_routes SET auto_refresh=false,origin_ciphertext=NULL,request_token=NULL,claim_until=NULL WHERE booking_id=target;
END $$;
CREATE FUNCTION beauty.invalidate_journey_route() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; BEGIN
 IF TG_OP='DELETE' THEN target:=OLD.booking_id;
 ELSIF TG_TABLE_NAME='bookings' THEN target:=NEW.id;
 ELSE target:=NEW.booking_id; END IF;
 UPDATE beauty.appointment_journey_routes SET auto_refresh=false,origin_ciphertext=NULL,request_token=NULL,claim_until=NULL,checked_at=NULL
 WHERE booking_id=target;
 RETURN NEW;
END $$;
CREATE TRIGGER invalidate_journey_route_plan AFTER UPDATE OR DELETE ON beauty.appointment_journey_plans FOR EACH ROW EXECUTE FUNCTION beauty.invalidate_journey_route();
CREATE TRIGGER invalidate_journey_route_booking AFTER UPDATE OF status,starts_at,ends_at ON beauty.bookings FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.starts_at IS DISTINCT FROM NEW.starts_at OR OLD.ends_at IS DISTINCT FROM NEW.ends_at) EXECUTE FUNCTION beauty.invalidate_journey_route();
CREATE TRIGGER invalidate_journey_route_location AFTER UPDATE OF version ON beauty.appointment_arrivals FOR EACH ROW WHEN(OLD.version IS DISTINCT FROM NEW.version) EXECUTE FUNCTION beauty.invalidate_journey_route();
CREATE FUNCTION beauty.invalidate_disabled_routing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT(NEW.routing_enabled AND NEW.journey_planner AND NEW.departure_reminders) THEN UPDATE beauty.appointment_journey_routes SET auto_refresh=false,origin_ciphertext=NULL,request_token=NULL,claim_until=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invalidate_disabled_routing AFTER UPDATE OF routing_enabled,journey_planner,departure_reminders ON beauty.arrival_settings FOR EACH ROW EXECUTE FUNCTION beauty.invalidate_disabled_routing();
CREATE FUNCTION beauty.admin_journey_routing_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_admin();
 RETURN (SELECT jsonb_build_object('enabled',routing_enabled,'dailyLimit',routing_daily_limit,'monthlyLimit',routing_monthly_limit,'refreshMinutes',routing_refresh_minutes,'changeMinutes',routing_change_minutes,'schedulerReady',coalesce(scheduler_tick_at>now()-interval '2 minutes',false)) FROM beauty.arrival_settings)
 ||jsonb_build_object('usedToday',coalesce((SELECT requests FROM beauty.journey_routing_usage WHERE day=(now() AT TIME ZONE 'UTC')::date),0),'usedMonth',(SELECT coalesce(sum(requests),0) FROM beauty.journey_routing_usage WHERE day>=date_trunc('month',now() AT TIME ZONE 'UTC')::date),'failedToday',coalesce((SELECT failures FROM beauty.journey_routing_usage WHERE day=(now() AT TIME ZONE 'UTC')::date),0),'activeRefreshes',(SELECT count(*) FROM beauty.appointment_journey_routes WHERE auto_refresh),'registeredDevices',(SELECT count(*) FROM beauty.push_subscriptions WHERE disabled_at IS NULL),'pushAccepted',(SELECT count(*) FROM beauty.push_deliveries WHERE status='accepted'),'deviceDisplayed',(SELECT count(displayed_at) FROM beauty.push_deliveries),'deviceClicked',(SELECT count(clicked_at) FROM beauty.push_deliveries),'emailsDelivered',(SELECT count(delivered_at) FROM beauty.notification_outbox));
END $$;
CREATE FUNCTION beauty.owner_journey_routing_settings(payload jsonb,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_owner(); BEGIN
 IF length(trim(coalesce(reason,''))) NOT BETWEEN 5 AND 500 OR payload->>'enabled' IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.arrival_settings SET routing_enabled=(payload->>'enabled')::boolean,routing_daily_limit=(payload->>'dailyLimit')::int,routing_monthly_limit=(payload->>'monthlyLimit')::int,routing_refresh_minutes=(payload->>'refreshMinutes')::int,routing_change_minutes=(payload->>'changeMinutes')::int,updated_at=now();
 PERFORM beauty.write_admin_audit(actor,'owner','journey.routing.settings',actor,'arrival',NULL,reason,payload);
END $$;
-- Browser-reported display and click are distinct from provider acceptance and
-- explicit customer acknowledgement. The endpoint verifies a scoped HMAC first.
ALTER TABLE beauty.push_deliveries ADD COLUMN displayed_at timestamptz,ADD COLUMN clicked_at timestamptz;
CREATE FUNCTION beauty.record_push_device_receipt(target uuid,kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF kind NOT IN('displayed','clicked') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.push_deliveries SET displayed_at=CASE WHEN kind='displayed' THEN now() ELSE displayed_at END,clicked_at=CASE WHEN kind='clicked' THEN now() ELSE clicked_at END WHERE id=target AND due_at>now()-interval '24 hours' AND status IN('pending','accepted') AND ((kind='displayed' AND displayed_at IS NULL) OR (kind='clicked' AND clicked_at IS NULL));
END $$;
CREATE FUNCTION beauty.test_customer_journey_push(target uuid,device uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb:=beauty.policy_booking_actor(target); uid uuid:=(identity->>'actor')::uuid; nid uuid; BEGIN
 IF (identity->>'professional')::boolean OR NOT EXISTS(SELECT 1 FROM beauty.bookings WHERE id=target AND status='confirmed') OR NOT EXISTS(SELECT 1 FROM beauty.push_subscriptions WHERE id=device AND user_id=uid AND disabled_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM beauty.bookings WHERE id=target FOR UPDATE;
 IF EXISTS(SELECT 1 FROM beauty.in_app_notifications WHERE user_id=uid AND kind='push_test' AND created_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href) VALUES(uid,target,'push_test','Appointment notification test','This is the device notification test you requested.','/account/bookings/'||target) RETURNING id INTO nid;
 INSERT INTO beauty.push_deliveries(notification_id,subscription_id) VALUES(nid,device) ON CONFLICT DO NOTHING;
END $$;
-- A refreshed plan changes revision to invalidate stale queued reminders. Keep
-- that from sending the same reminder stage again a few minutes later.
CREATE FUNCTION beauty.deduplicate_departure_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.kind='journey_departure' AND split_part(NEW.event_key,':',4) IN('15','5','now') AND EXISTS(
 SELECT 1 FROM beauty.in_app_notifications i WHERE i.booking_id=NEW.booking_id AND i.kind='journey_departure' AND split_part(i.event_key,':',4)=split_part(NEW.event_key,':',4) AND i.created_at>now()-interval '10 minutes'
 ) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER deduplicate_departure_stage BEFORE INSERT ON beauty.in_app_notifications FOR EACH ROW EXECUTE FUNCTION beauty.deduplicate_departure_stage();
-- Keep existing management output shape, adding only explicit device receipts.
DO $$ DECLARE ddl text; BEGIN
 SELECT pg_get_functiondef('beauty.admin_arrival_overview(uuid)'::regprocedure) INTO ddl;
 IF strpos(ddl,'''sentAt'',d.sent_at,''error'',d.last_error')=0 THEN RAISE EXCEPTION 'ARRIVAL_RECEIPT_REVIEW_REQUIRED'; END IF;
 EXECUTE replace(ddl,'''sentAt'',d.sent_at,''error'',d.last_error','''sentAt'',d.sent_at,''error'',d.last_error,''displayedAt'',d.displayed_at,''clickedAt'',d.clicked_at');
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname=ANY(ARRAY['spend_journey_routing_request','customer_journey_route','reserve_customer_journey_route','cleanup_journey_routes','claim_journey_route_refreshes','finish_journey_route','save_customer_journey_route','stop_customer_route_refresh','invalidate_journey_route','invalidate_disabled_routing','admin_journey_routing_overview','owner_journey_routing_settings','record_push_device_receipt','deduplicate_departure_stage','test_customer_journey_push']) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO beauty_booking_ops',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker',f.signature);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
GRANT UPDATE(displayed_at,clicked_at) ON beauty.push_deliveries TO beauty_booking_ops;
GRANT INSERT ON beauty.push_deliveries TO beauty_booking_ops;
CREATE POLICY arrival_push_test_insert ON beauty.push_deliveries FOR INSERT TO beauty_booking_ops WITH CHECK(true);
CREATE POLICY arrival_push_receipt ON beauty.push_deliveries FOR UPDATE TO beauty_booking_ops USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.push_subscriptions TO beauty_booking_ops;
CREATE POLICY routing_push_read ON beauty.push_subscriptions FOR SELECT TO beauty_booking_ops USING(true);
GRANT EXECUTE ON FUNCTION beauty.customer_journey_route(uuid),beauty.reserve_customer_journey_route(uuid),beauty.save_customer_journey_route(uuid,uuid,jsonb,text),beauty.stop_customer_route_refresh(uuid),beauty.admin_journey_routing_overview(),beauty.owner_journey_routing_settings(jsonb,text) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.test_customer_journey_push(uuid,uuid) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.cleanup_journey_routes(),beauty.claim_journey_route_refreshes(),beauty.finish_journey_route(uuid,uuid,jsonb,text),beauty.record_push_device_receipt(uuid,text) TO beauty_payment_worker;

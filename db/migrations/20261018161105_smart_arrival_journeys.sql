-- Private, appointment-scoped operations. Default OFF pending controlled rollout.
-- Existing bookings, policies, payments, inbox, provider receipts and push queues
-- remain authoritative. No movement history or customer starting address stored.
CREATE TABLE beauty.arrival_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 smart_arrival boolean NOT NULL DEFAULT false, journey_planner boolean NOT NULL DEFAULT false,
 journey_sharing boolean NOT NULL DEFAULT true, departure_reminders boolean NOT NULL DEFAULT false,
 radius_m integer NOT NULL DEFAULT 100 CHECK(radius_m BETWEEN 50 AND 200),
 default_buffer integer NOT NULL DEFAULT 10 CHECK(default_buffer BETWEEN 0 AND 120),
 scheduler_tick_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO beauty.arrival_settings DEFAULT VALUES;
CREATE TABLE beauty.appointment_arrivals (
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id) ON DELETE CASCADE,
 enabled boolean NOT NULL, latitude double precision NOT NULL CHECK(latitude BETWEEN -85 AND 85),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=1000),
 radius_m integer NOT NULL CHECK(radius_m BETWEEN 50 AND 200), version integer NOT NULL DEFAULT 1,
 acknowledged_at timestamptz, consent_at timestamptz, consent_version text,
 candidate_at timestamptz, detected_at timestamptz, manual_at timestamptz,
 attendance_at timestamptz, started_at timestamptz, accuracy_m double precision,
 last_reading_at timestamptz, device_observed_at timestamptz,
 detection_status text NOT NULL DEFAULT 'off' CHECK(detection_status IN('off','active','unreliable','outside','candidate','detected')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.appointment_arrival_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES beauty.bookings(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES beauty.users(id), kind text NOT NULL CHECK(kind IN('configured','acknowledged','consent_enabled','consent_stopped','detected','manual','attendance','started','dispute','correction','late','plan_saved','reminders_stopped','sharing_started','sharing_stopped')),
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointment_arrival_events_booking ON beauty.appointment_arrival_events(booking_id,created_at DESC);
CREATE TABLE beauty.appointment_journey_plans (
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id) ON DELETE CASCADE,
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 1 AND 1440), buffer_minutes integer NOT NULL CHECK(buffer_minutes BETWEEN 0 AND 120),
 mode text NOT NULL CHECK(mode IN('driving','transit','walking','bicycling')),
 reminders boolean NOT NULL DEFAULT false, departure_at timestamptz NOT NULL,
 planned_starts_at timestamptz NOT NULL, location_version integer NOT NULL,
 revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointment_journey_due ON beauty.appointment_journey_plans(departure_at) WHERE reminders;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['arrival_settings','appointment_arrivals','appointment_arrival_events','appointment_journey_plans'] LOOP
  EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.%I TO beauty_booking_ops',t);
  EXECUTE format('CREATE POLICY arrival_internal ON beauty.%I FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
-- This privileged role is NOLOGIN/NOBYPASSRLS. Only reviewed routines below are
-- executable by app users. Direct app writes to authoritative records are denied.
ALTER TABLE beauty.booking_location_sessions ADD COLUMN session_nonce uuid NOT NULL DEFAULT gen_random_uuid();
GRANT SELECT,UPDATE ON beauty.booking_location_sessions TO beauty_booking_ops;
CREATE POLICY arrival_location_internal ON beauty.booking_location_sessions FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.notification_outbox,beauty.in_app_notifications TO beauty_booking_ops;
CREATE POLICY arrival_inbox_read ON beauty.in_app_notifications FOR SELECT TO beauty_booking_ops USING(true);
GRANT SELECT ON beauty.push_deliveries TO beauty_booking_ops;
CREATE POLICY arrival_push_read ON beauty.push_deliveries FOR SELECT TO beauty_booking_ops USING(true);
GRANT EXECUTE ON FUNCTION beauty.require_admin(),beauty.require_owner(),beauty.write_admin_audit(uuid,text,text,uuid,text,uuid,text,jsonb) TO beauty_booking_ops;
ALTER TABLE beauty.in_app_notifications DROP CONSTRAINT in_app_notifications_kind_check;
ALTER TABLE beauty.in_app_notifications ADD CHECK(kind IN('booking_created','booking_confirmed','booking_cancelled','appointment_completed','booking_reminder','order_paid','order_processing','order_shipped','order_delivered','order_refund_pending','order_refunded','order_shipping_reminder','commission_changed','booking_policy_update','professional_policy_review','professional_activity','customer_message','review_received','dispute_opened','refund_requested','push_test','promotion','order_cancelled','arrival_update','journey_departure'));
-- Extend the established generic inbox-email pipeline and verified provider
-- webhooks. Its existing idempotency keys prevent duplicate emails.
CREATE FUNCTION beauty.arrival_notify(target uuid,recipient uuid,heading text,detail text,event_key text,reminder boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE nid uuid; BEGIN
 INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href,event_key)
 VALUES(recipient,target,CASE WHEN reminder THEN 'journey_departure' ELSE 'arrival_update' END,heading,left(detail,500),'/account/bookings/'||target,event_key)
 ON CONFLICT DO NOTHING RETURNING id INTO nid;
 IF nid IS NOT NULL THEN
  INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id,notification_id,event_reference)
  VALUES(target,'professional_alert',recipient,nid,nid::text) ON CONFLICT DO NOTHING;
 END IF;
END $$;
-- Polling is authenticated, private and bounded; it reuses the existing booking
-- page. Never return a customer origin or plan to the professional.
CREATE FUNCTION beauty.appointment_arrival(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb:=beauty.policy_booking_actor(target); b beauty.bookings; a beauty.appointment_arrivals; s beauty.arrival_settings; p beauty.booking_policy_terms; pro boolean:=(identity->>'professional')::boolean; BEGIN
 SELECT * INTO b FROM beauty.bookings WHERE id=target;
 SELECT * INTO s FROM beauty.arrival_settings;
 SELECT * INTO a FROM beauty.appointment_arrivals WHERE booking_id=target;
 SELECT * INTO p FROM beauty.booking_policy_terms WHERE booking_id=target;
 RETURN jsonb_build_object('professional',pro,'config',jsonb_build_object('smartArrival',s.smart_arrival,'journeyPlanner',s.journey_planner,'journeySharing',s.journey_sharing,'departureReminders',s.departure_reminders,'radiusM',s.radius_m,'defaultBuffer',s.default_buffer,'schedulerReady',coalesce(s.scheduler_tick_at>now()-interval '2 minutes',false)),
 'startsAt',b.starts_at,'endsAt',b.ends_at,'status',b.status,'windowOpen',b.status='confirmed' AND now() BETWEEN b.starts_at-interval '3 hours' AND b.ends_at,
 'graceMinutes',coalesce((p.snapshot->'rules'->>'graceMinutes')::int,10),'lateInstructions',coalesce(p.snapshot->'rules'->>'lateInstructions',''),
 'arrival',CASE WHEN a.booking_id IS NULL THEN NULL ELSE to_jsonb(a)-'candidate_at'-'device_observed_at' END,
 'plan',CASE WHEN pro THEN NULL ELSE (SELECT to_jsonb(j)-'planned_starts_at' FROM beauty.appointment_journey_plans j WHERE booking_id=target AND j.planned_starts_at=b.starts_at AND j.location_version=a.version) END,
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'actor_id'-'booking_id' ORDER BY created_at,id) FROM beauty.appointment_arrival_events e WHERE booking_id=target AND (NOT pro OR kind NOT IN('plan_saved','reminders_stopped'))),'[]'));
END $$;
CREATE FUNCTION beauty.appointment_arrival_action(target uuid,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb:=beauty.policy_booking_actor(target); actor uuid:=(identity->>'actor')::uuid; pro boolean:=(identity->>'professional')::boolean;
 b beauty.bookings; a beauty.appointment_arrivals; s beauty.arrival_settings; operation text:=payload->>'action';
 event uuid; pro_user uuid; detail text; acc double precision; lat double precision; lng double precision; distance_m double precision; observed timestamptz;
 revision integer; duration integer; buffer integer; eta timestamptz;
BEGIN
 SELECT * INTO b FROM beauty.bookings WHERE id=target FOR UPDATE;
 SELECT * INTO a FROM beauty.appointment_arrivals WHERE booking_id=target;
 SELECT * INTO s FROM beauty.arrival_settings;
 SELECT user_id INTO pro_user FROM beauty.professional_profiles WHERE id=b.professional_id;
 IF operation='dispute' THEN
  IF length(trim(coalesce(payload->>'reason',''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM beauty.appointment_arrival_events WHERE booking_id=target AND kind='dispute' AND actor_id=actor AND created_at>now()-interval '1 hour') THEN RAISE EXCEPTION 'ARRIVAL_RATE_LIMIT' USING ERRCODE='22023'; END IF;
  INSERT INTO beauty.appointment_arrival_events(booking_id,actor_id,kind,details) VALUES(target,actor,'dispute',jsonb_build_object('reason',payload->>'reason'));
  RETURN beauty.appointment_arrival(target);
 END IF;
 IF b.status<>'confirmed' OR now()>=b.ends_at THEN RAISE EXCEPTION 'ARRIVAL_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 IF operation='configure' THEN
  IF NOT pro THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT(s.smart_arrival OR s.journey_planner) THEN RAISE EXCEPTION 'ARRIVAL_UNAVAILABLE' USING ERRCODE='22023'; END IF;
  IF (payload->>'expectedVersion')::int<>coalesce(a.version,0) THEN RAISE EXCEPTION 'ARRIVAL_CHANGED' USING ERRCODE='22023'; END IF;
  IF a.detected_at IS NOT NULL OR a.manual_at IS NOT NULL OR a.attendance_at IS NOT NULL THEN RAISE EXCEPTION 'ARRIVAL_ALREADY_RECORDED' USING ERRCODE='22023'; END IF;
  IF a.booking_id IS NOT NULL AND now()>=b.starts_at THEN RAISE EXCEPTION 'ARRIVAL_CHANGED' USING ERRCODE='22023'; END IF;
  lat:=(payload->>'latitude')::float8; lng:=(payload->>'longitude')::float8;
  IF lat IS NULL OR lng IS NULL OR length(coalesce(payload->>'instructions',''))>1000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  INSERT INTO beauty.appointment_arrivals(booking_id,enabled,latitude,longitude,instructions,radius_m)
  VALUES(target,coalesce((payload->>'enabled')::boolean,false),lat,lng,coalesce(payload->>'instructions',''),s.radius_m)
  ON CONFLICT(booking_id) DO UPDATE SET enabled=excluded.enabled,latitude=excluded.latitude,longitude=excluded.longitude,instructions=excluded.instructions,radius_m=excluded.radius_m,
  version=appointment_arrivals.version+1,acknowledged_at=NULL,consent_at=NULL,candidate_at=NULL,detection_status='off',updated_at=now();
  UPDATE beauty.booking_location_sessions SET sharing=false,last_latitude=NULL,last_longitude=NULL,last_accuracy_m=NULL,last_observed_at=NULL,stopped_at=now() WHERE booking_id=target;
  UPDATE beauty.appointment_journey_plans SET reminders=false WHERE booking_id=target;
  detail:='Review your agreed appointment location and arrival instructions. Acknowledge the current version on your booking before enabling location detection. Location permissions remain optional.';
 ELSIF operation='attendance' OR operation='started' THEN
  IF NOT pro THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT s.smart_arrival OR a.booking_id IS NULL OR now()<b.starts_at-interval '3 hours' THEN RAISE EXCEPTION 'ARRIVAL_WINDOW' USING ERRCODE='22023'; END IF;
  IF (operation='attendance' AND a.attendance_at IS NOT NULL) OR (operation='started' AND a.started_at IS NOT NULL) THEN RETURN beauty.appointment_arrival(target); END IF;
  IF operation='started' AND a.attendance_at IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  UPDATE beauty.appointment_arrivals SET attendance_at=CASE WHEN operation='attendance' THEN coalesce(attendance_at,now()) ELSE attendance_at END,
  started_at=CASE WHEN operation='started' THEN coalesce(started_at,now()) ELSE started_at END WHERE booking_id=target;
  detail:=CASE WHEN operation='attendance' THEN 'Your professional confirmed physical attendance.' ELSE 'Your professional recorded that the appointment has started. This does not mark it completed.' END;
 ELSE
  IF pro THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF operation='acknowledge' THEN
   IF a.booking_id IS NULL OR (payload->>'version')::int<>a.version THEN RAISE EXCEPTION 'ARRIVAL_CHANGED' USING ERRCODE='22023'; END IF;
   IF a.acknowledged_at IS NOT NULL THEN RETURN beauty.appointment_arrival(target); END IF;
   UPDATE beauty.appointment_arrivals SET acknowledged_at=now() WHERE booking_id=target;
  ELSIF operation='consent' THEN
   IF NOT (payload->>'enabled')::boolean THEN
    UPDATE beauty.appointment_arrivals SET consent_at=NULL,candidate_at=NULL,detection_status=CASE WHEN detected_at IS NULL THEN 'off' ELSE 'detected' END WHERE booking_id=target;
   ELSE
    IF NOT s.smart_arrival OR NOT coalesce(a.enabled,false) THEN RAISE EXCEPTION 'ARRIVAL_UNAVAILABLE' USING ERRCODE='22023'; END IF;
    IF a.acknowledged_at IS NULL THEN RAISE EXCEPTION 'ARRIVAL_ACK_REQUIRED' USING ERRCODE='22023'; END IF;
    UPDATE beauty.appointment_arrivals SET consent_at=now(),consent_version='smart-arrival-v1',detection_status=CASE WHEN detected_at IS NULL THEN 'active' ELSE 'detected' END WHERE booking_id=target;
   END IF;
  ELSIF operation='reading' THEN
   IF NOT s.smart_arrival OR NOT coalesce(a.enabled,false) OR a.consent_at IS NULL OR a.acknowledged_at IS NULL THEN RAISE EXCEPTION 'ARRIVAL_UNAVAILABLE' USING ERRCODE='22023'; END IF;
   IF now() NOT BETWEEN b.starts_at-interval '3 hours' AND b.ends_at THEN RAISE EXCEPTION 'ARRIVAL_WINDOW' USING ERRCODE='22023'; END IF;
   IF a.detected_at IS NOT NULL THEN RETURN beauty.appointment_arrival(target); END IF;
   observed:=(payload->>'observedAt')::timestamptz;acc:=(payload->>'accuracyM')::float8;lat:=(payload->>'latitude')::float8;lng:=(payload->>'longitude')::float8;
   IF observed IS NULL OR abs(extract(epoch FROM now()-observed))>60 OR observed<=a.device_observed_at OR acc IS NULL OR acc<0 OR acc>5000 OR lat IS NULL OR lng IS NULL OR lat NOT BETWEEN -85 AND 85 OR lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
   IF a.last_reading_at>now()-interval '5 seconds' THEN RAISE EXCEPTION 'ARRIVAL_RATE_LIMIT' USING ERRCODE='22023'; END IF;
   distance_m:=6371000*2*asin(sqrt(least(1,power(sin(radians(lat-a.latitude)/2),2)+cos(radians(lat))*cos(radians(a.latitude))*power(sin(radians(lng-a.longitude)/2),2))));
   UPDATE beauty.appointment_arrivals SET last_reading_at=now(),device_observed_at=observed,accuracy_m=acc,
   candidate_at=CASE WHEN acc<=50 AND distance_m+acc<=a.radius_m THEN CASE WHEN a.candidate_at>now()-interval '90 seconds' THEN a.candidate_at ELSE now() END ELSE NULL END,
   detection_status=CASE WHEN acc>50 THEN 'unreliable' WHEN distance_m+acc>a.radius_m THEN 'outside' ELSE 'candidate' END WHERE booking_id=target;
   IF acc<=50 AND distance_m+acc<=a.radius_m AND a.candidate_at BETWEEN now()-interval '90 seconds' AND now()-interval '5 seconds' THEN
    UPDATE beauty.appointment_arrivals SET detected_at=a.candidate_at,detection_status='detected' WHERE booking_id=target AND detected_at IS NULL;
    operation:='detected';detail:='Location detected near the appointment at '||to_char(a.candidate_at AT TIME ZONE 'Europe/London','DD Mon HH24:MI')||' London time. This is proximity evidence, not proof of attendance.';
   ELSE RETURN beauty.appointment_arrival(target); END IF;
  ELSIF operation='manual' THEN
   IF NOT s.smart_arrival OR a.booking_id IS NULL OR now()<b.starts_at-interval '3 hours' THEN RAISE EXCEPTION 'ARRIVAL_WINDOW' USING ERRCODE='22023'; END IF;
   IF a.manual_at IS NOT NULL THEN RETURN beauty.appointment_arrival(target); END IF;
   UPDATE beauty.appointment_arrivals SET manual_at=now() WHERE booking_id=target;
   detail:='The customer pressed “I’ve arrived”. This is a manual check-in; the professional can confirm attendance.';
  ELSIF operation='late' THEN
   IF NOT(s.journey_planner OR s.smart_arrival) THEN RAISE EXCEPTION 'ARRIVAL_UNAVAILABLE' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM beauty.appointment_arrival_events WHERE booking_id=target AND kind='late' AND created_at>now()-interval '5 minutes') THEN RAISE EXCEPTION 'ARRIVAL_RATE_LIMIT' USING ERRCODE='22023'; END IF;
   eta:=(payload->>'eta')::timestamptz;
   IF eta IS NOT NULL AND (eta<now() OR eta>b.ends_at+interval '3 hours') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
   detail:='The customer reported running late.'||CASE WHEN eta IS NULL THEN '' ELSE ' Customer-estimated arrival: '||to_char(eta AT TIME ZONE 'Europe/London','DD Mon HH24:MI')||' London time.' END||' Review the accepted late policy; no cancellation or charge has been made.';
  ELSIF operation='plan' THEN
   IF NOT s.journey_planner OR a.booking_id IS NULL OR b.starts_at<=now() THEN RAISE EXCEPTION 'ARRIVAL_UNAVAILABLE' USING ERRCODE='22023'; END IF;
   duration:=(payload->>'durationMinutes')::int;buffer:=(payload->>'bufferMinutes')::int;
   IF duration IS NULL OR buffer IS NULL OR duration NOT BETWEEN 1 AND 1440 OR buffer NOT BETWEEN 0 AND 120 OR payload->>'mode' NOT IN('driving','transit','walking','bicycling') OR ((payload->>'reminders')::boolean AND NOT s.departure_reminders) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
   INSERT INTO beauty.appointment_journey_plans(booking_id,duration_minutes,buffer_minutes,mode,reminders,departure_at,planned_starts_at,location_version)
   VALUES(target,duration,buffer,payload->>'mode',coalesce((payload->>'reminders')::boolean,false),b.starts_at-(duration+buffer)*interval '1 minute',b.starts_at,a.version)
   ON CONFLICT(booking_id) DO UPDATE SET duration_minutes=excluded.duration_minutes,buffer_minutes=excluded.buffer_minutes,mode=excluded.mode,reminders=excluded.reminders,departure_at=excluded.departure_at,planned_starts_at=excluded.planned_starts_at,location_version=excluded.location_version,revision=appointment_journey_plans.revision+1,updated_at=now();
   operation:='plan_saved';
  ELSIF operation='reminders' THEN
   UPDATE beauty.appointment_journey_plans SET reminders=false WHERE booking_id=target;
   operation:='reminders_stopped';
  ELSE RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO beauty.appointment_arrival_events(booking_id,actor_id,kind,details)
 VALUES(target,actor,CASE WHEN operation='configure' THEN 'configured' WHEN operation='acknowledge' THEN 'acknowledged' WHEN operation='consent' THEN CASE WHEN (payload->>'enabled')::boolean THEN 'consent_enabled' ELSE 'consent_stopped' END ELSE operation END,
 CASE WHEN operation='configure' THEN jsonb_build_object('version',coalesce(a.version,0)+1,'instructions',payload->>'instructions','latitude',payload->'latitude','longitude',payload->'longitude','radiusM',s.radius_m)
 WHEN operation='acknowledge' THEN jsonb_build_object('version',a.version)
 WHEN operation='late' THEN jsonb_build_object('eta',eta)
 WHEN operation='detected' THEN jsonb_build_object('method','location_detected','accuracyM',acc,'observedAt',observed,'serverReceiptAt',now(),'firstReliableReceiptAt',a.candidate_at)
 ELSE '{}'::jsonb END) RETURNING id INTO event;
 IF detail IS NOT NULL THEN
  PERFORM beauty.arrival_notify(target,CASE WHEN pro THEN b.customer_id ELSE pro_user END,'Appointment arrival update',detail,'arrival:'||event);
  PERFORM beauty.arrival_notify(target,actor,'Appointment arrival update',detail,'arrival:'||event);
 END IF;
 RETURN beauty.appointment_arrival(target);
END $$;
-- Revoke live coordinates immediately on terminal bookings and reschedules;
-- consent is never carried over to a new appointment time or location.
CREATE FUNCTION beauty.revoke_appointment_journey() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.status<>'confirmed' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at THEN
  UPDATE beauty.booking_location_sessions SET sharing=false,session_nonce=gen_random_uuid(),stopped_at=now(),last_latitude=NULL,last_longitude=NULL,last_accuracy_m=NULL,last_observed_at=NULL WHERE booking_id=NEW.id;
  UPDATE beauty.appointment_arrivals SET consent_at=NULL,candidate_at=NULL,acknowledged_at=CASE WHEN NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN NULL ELSE acknowledged_at END WHERE booking_id=NEW.id;
  UPDATE beauty.appointment_journey_plans SET reminders=false WHERE booking_id=NEW.id;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER revoke_appointment_journey AFTER UPDATE OF status,starts_at,ends_at ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.revoke_appointment_journey();
CREATE FUNCTION beauty.prepare_arrival_reminders() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j record; stage text; heading text; BEGIN
 -- Drop stale coordinates even if no browser is left open. Retain no GPS trail.
 UPDATE beauty.booking_location_sessions SET sharing=false,session_nonce=gen_random_uuid(),stopped_at=coalesce(stopped_at,now()),last_latitude=NULL,last_longitude=NULL,last_accuracy_m=NULL,last_observed_at=NULL
 WHERE expires_at<=now() OR (last_observed_at IS NOT NULL AND last_observed_at<now()-interval '90 seconds');
 DELETE FROM beauty.appointment_journey_plans expired_plan USING beauty.bookings b WHERE b.id=expired_plan.booking_id AND b.ends_at<now()-interval '1 day';
 UPDATE beauty.appointment_arrival_events e SET details=e.details-'instructions'-'latitude'-'longitude' FROM beauty.bookings b WHERE b.id=e.booking_id AND b.ends_at<now()-interval '30 days' AND e.kind='configured' AND (e.details ? 'instructions' OR e.details ? 'latitude');
 DELETE FROM beauty.appointment_arrival_events e WHERE e.created_at<now()-interval '180 days' AND NOT EXISTS(SELECT 1 FROM beauty.appointment_arrival_events dispute WHERE dispute.booking_id=e.booking_id AND dispute.kind='dispute' AND NOT EXISTS(SELECT 1 FROM beauty.appointment_arrival_events correction WHERE correction.booking_id=dispute.booking_id AND correction.kind='correction' AND correction.created_at>dispute.created_at));
 UPDATE beauty.appointment_arrivals a SET latitude=0,longitude=0,instructions='',consent_at=NULL,candidate_at=NULL FROM beauty.bookings b WHERE b.id=a.booking_id AND b.ends_at<now()-interval '30 days' AND (a.latitude<>0 OR a.longitude<>0 OR a.instructions<>'' OR a.consent_at IS NOT NULL);
 FOR j IN SELECT p.*,b.customer_id FROM beauty.appointment_journey_plans p JOIN beauty.bookings b ON b.id=p.booking_id JOIN beauty.appointment_arrivals a ON a.booking_id=b.id CROSS JOIN beauty.arrival_settings s
 WHERE s.journey_planner AND s.departure_reminders AND s.scheduler_tick_at>now()-interval '2 minutes' AND p.reminders AND b.status='confirmed' AND b.starts_at=p.planned_starts_at AND a.version=p.location_version AND b.starts_at>now() AND p.departure_at>now()-interval '5 minutes' AND p.departure_at<=now()+interval '15 minutes' LOOP
  -- One most relevant reminder per scheduler tick. Late scheduler invocations
  -- skip stale stages instead of sending all missed reminders together.
  IF j.departure_at<=now() THEN stage:='now';heading:='It’s time to leave for your appointment';
  ELSIF j.departure_at<=now()+interval '5 minutes' THEN stage:='5';heading:='Leave in approximately 5 minutes';
  ELSE stage:='15';heading:='Leave in approximately 15 minutes'; END IF;
  PERFORM beauty.arrival_notify(j.booking_id,j.customer_id,heading,'Based on your saved journey estimate. Check current directions before travelling. Open your appointment for the departure time.','departure:'||j.booking_id||':'||j.revision||':'||stage,true);
 END LOOP;
END $$;
CREATE FUNCTION beauty.admin_arrival_overview(target uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_admin();
 RETURN jsonb_build_object('config',(SELECT jsonb_build_object('smartArrival',smart_arrival,'journeyPlanner',journey_planner,'journeySharing',journey_sharing,'departureReminders',departure_reminders,'radiusM',radius_m,'defaultBuffer',default_buffer,'schedulerReady',coalesce(scheduler_tick_at>now()-interval '2 minutes',false)) FROM beauty.arrival_settings),
 'counts',(SELECT jsonb_build_object('detected',count(detected_at),'manual',count(manual_at),'attendance',count(attendance_at),'unreliable',count(*) FILTER(WHERE detection_status='unreliable')) FROM beauty.appointment_arrivals),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'actor_id' ORDER BY created_at DESC) FROM (SELECT id,booking_id,kind,created_at,details FROM beauty.appointment_arrival_events WHERE (target IS NULL OR booking_id=target) AND kind NOT IN('plan_saved','reminders_stopped') ORDER BY created_at DESC LIMIT 100) e),'[]'),
 'policy',CASE WHEN target IS NULL THEN NULL ELSE (SELECT jsonb_build_object('acknowledgedAt',acknowledged_at,'source',acknowledgement_source,'versionToken',snapshot->>'token','rules',snapshot->'rules') FROM beauty.booking_policy_terms WHERE booking_id=target) END,
 'communications',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY created_at DESC) FROM (
 SELECT i.id,i.booking_id,i.title,i.body,i.created_at,i.read_at,o.sent_at,o.delivered_at,o.delivery_status,o.attempts,o.last_error,
 coalesce((SELECT jsonb_agg(jsonb_build_object('status',d.status,'sentAt',d.sent_at,'error',d.last_error)) FROM beauty.push_deliveries d WHERE d.notification_id=i.id),'[]') AS push
 FROM beauty.in_app_notifications i LEFT JOIN beauty.notification_outbox o ON o.notification_id=i.id
 WHERE (target IS NULL OR i.booking_id=target) AND i.kind IN('arrival_update','journey_departure') ORDER BY i.created_at DESC LIMIT 100)n),'[]'));
END $$;
CREATE FUNCTION beauty.owner_arrival_settings(payload jsonb,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_owner(); BEGIN
 IF (payload->>'departureReminders')::boolean AND NOT coalesce((SELECT scheduler_tick_at>now()-interval '2 minutes' FROM beauty.arrival_settings),false) THEN RAISE EXCEPTION 'ARRIVAL_SCHEDULER_NOT_READY' USING ERRCODE='22023'; END IF;
 IF length(trim(coalesce(reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.arrival_settings SET smart_arrival=(payload->>'smartArrival')::boolean,journey_planner=(payload->>'journeyPlanner')::boolean,journey_sharing=(payload->>'journeySharing')::boolean,departure_reminders=(payload->>'departureReminders')::boolean,radius_m=(payload->>'radiusM')::int,default_buffer=(payload->>'defaultBuffer')::int,updated_at=now();
 IF NOT (payload->>'journeySharing')::boolean THEN UPDATE beauty.booking_location_sessions SET sharing=false,session_nonce=gen_random_uuid(),stopped_at=now(),last_latitude=NULL,last_longitude=NULL,last_accuracy_m=NULL,last_observed_at=NULL; END IF;
 IF NOT (payload->>'smartArrival')::boolean THEN UPDATE beauty.appointment_arrivals SET consent_at=NULL,candidate_at=NULL; END IF;
 IF NOT (payload->>'departureReminders')::boolean THEN UPDATE beauty.appointment_journey_plans SET reminders=false; END IF;
 PERFORM beauty.write_admin_audit(actor,'owner','arrival.settings',actor,'arrival',NULL,reason,payload);
END $$;
CREATE FUNCTION beauty.admin_arrival_correction(target uuid,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_admin(); BEGIN
 IF length(trim(coalesce(reason,''))) NOT BETWEEN 10 AND 1000 OR NOT EXISTS(SELECT 1 FROM beauty.bookings WHERE id=target) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.appointment_arrival_events(booking_id,actor_id,kind,details) VALUES(target,actor,'correction',jsonb_build_object('reason',reason));
 PERFORM beauty.write_admin_audit(actor,'admin','arrival.correction',(SELECT customer_id FROM beauty.bookings WHERE id=target),'booking',target,reason,'{}');
END $$;
-- Only authenticated role-checked functions; helpers and triggers are internal.
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname=ANY(ARRAY['arrival_notify','appointment_arrival','appointment_arrival_action','revoke_appointment_journey','prepare_arrival_reminders','admin_arrival_overview','owner_arrival_settings','admin_arrival_correction']) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO beauty_booking_ops',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker',f.signature);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
GRANT EXECUTE ON FUNCTION beauty.appointment_arrival(uuid),beauty.appointment_arrival_action(uuid,jsonb),beauty.admin_arrival_overview(uuid),beauty.owner_arrival_settings(jsonb,text),beauty.admin_arrival_correction(uuid,text) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.prepare_arrival_reminders() TO beauty_payment_worker;
CREATE OR REPLACE FUNCTION beauty.notification_category(kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN kind='booking_confirmed' THEN 'bookings'
 WHEN kind IN('booking_cancelled','booking_policy_update','dispute_opened','refund_requested','arrival_update') THEN 'changes'
 WHEN kind IN('booking_reminder','journey_departure') THEN 'reminders' WHEN kind='customer_message' THEN 'messages'
 WHEN kind='review_received' THEN 'reviews' WHEN kind='promotion' THEN 'promotions'
 WHEN kind LIKE 'order_%' THEN 'orders' ELSE 'critical' END
$$;
CREATE FUNCTION beauty.fanout_customer_arrival() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.kind IN('arrival_update','journey_departure') AND EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.id=NEW.booking_id AND b.customer_id=NEW.user_id)
 AND NOT EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.user_id=NEW.user_id) THEN
  INSERT INTO beauty.push_deliveries(notification_id,subscription_id) SELECT NEW.id,s.id FROM beauty.push_subscriptions s WHERE s.user_id=NEW.user_id AND s.disabled_at IS NULL ON CONFLICT DO NOTHING;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER fanout_customer_arrival AFTER INSERT ON beauty.in_app_notifications FOR EACH ROW EXECUTE FUNCTION beauty.fanout_customer_arrival();
CREATE FUNCTION beauty.save_customer_journey_push(target uuid,endpoint text,p256dh text,auth text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid; result uuid; BEGIN
 SELECT u.id INTO uid FROM beauty.users u JOIN beauty.bookings b ON b.customer_id=u.id WHERE b.id=target AND u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL AND b.status='confirmed';
 IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF length(endpoint)>2048 OR endpoint !~ '^https://' OR length(p256dh) NOT BETWEEN 87 AND 88 OR length(auth) NOT BETWEEN 22 AND 24 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.push_subscriptions(user_id,endpoint,p256dh,auth,label) VALUES(uid,endpoint,p256dh,auth,'Customer journey reminders')
 ON CONFLICT ON CONSTRAINT push_subscriptions_endpoint_key DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,disabled_at=NULL,last_error=NULL WHERE push_subscriptions.user_id=uid RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;RETURN result;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_notification_ops;
ALTER FUNCTION beauty.fanout_customer_arrival() OWNER TO beauty_notification_ops;
ALTER FUNCTION beauty.save_customer_journey_push(uuid,text,text,text) OWNER TO beauty_notification_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_notification_ops;
REVOKE ALL ON FUNCTION beauty.fanout_customer_arrival(),beauty.save_customer_journey_push(uuid,text,text,text) FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.save_customer_journey_push(uuid,text,text,text) TO beauty_app;
CREATE FUNCTION beauty.arrival_notice_current(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN i.kind<>'journey_departure' THEN true ELSE EXISTS(
 SELECT 1 FROM beauty.bookings b JOIN beauty.appointment_journey_plans j ON j.booking_id=b.id JOIN beauty.appointment_arrivals a ON a.booking_id=b.id CROSS JOIN beauty.arrival_settings s
 WHERE b.id=i.booking_id AND s.journey_planner AND s.departure_reminders AND s.scheduler_tick_at>now()-interval '2 minutes' AND j.reminders AND b.status='confirmed' AND b.starts_at=j.planned_starts_at AND a.version=j.location_version AND b.starts_at>now()
 AND i.event_key LIKE 'departure:'||j.booking_id||':'||j.revision||':%' AND i.created_at>now()-interval '4 minutes') END
 FROM beauty.in_app_notifications i WHERE i.id=target
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.arrival_notice_current(uuid) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.arrival_notice_current(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.arrival_notice_current(uuid) TO beauty_notification_ops;
DO $$ DECLARE ddl text; BEGIN
 SELECT pg_get_functiondef('beauty.claim_professional_alert_emails()'::regprocedure) INTO ddl;
 IF strpos(ddl,'AND u.status=''active''')=0 THEN RAISE EXCEPTION 'ARRIVAL_EMAIL_CLAIM_REVIEW_REQUIRED'; END IF;
 ddl:=replace(ddl,'AND u.status=''active''','AND beauty.arrival_notice_current(i.id) AND u.status=''active''');EXECUTE ddl;
 SELECT pg_get_functiondef('beauty.claim_push_deliveries()'::regprocedure) INTO ddl;
 IF strpos(ddl,'WHERE d.status=''pending'' AND d.due_at<=now()')=0 THEN RAISE EXCEPTION 'ARRIVAL_PUSH_CLAIM_REVIEW_REQUIRED'; END IF;
 ddl:=replace(ddl,'WHERE d.status=''pending'' AND d.due_at<=now()','WHERE d.status=''pending'' AND beauty.arrival_notice_current(d.notification_id) AND d.due_at<=now()');EXECUTE ddl;
END $$;
-- Public feature switches contain no personal data; app reads are needed for
-- the existing journey endpoint, while all writes stay in owner routines.
GRANT SELECT ON beauty.arrival_settings TO beauty_app;
CREATE POLICY arrival_feature_read ON beauty.arrival_settings FOR SELECT TO beauty_app USING(true);
-- Even a direct runtime SQL read cannot reveal a stopped, expired or stale
-- location to the professional. Customers retain their own consent record.
CREATE POLICY arrival_location_visibility ON beauty.booking_location_sessions AS RESTRICTIVE FOR SELECT TO beauty_app USING(
 EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=customer_id AND u.auth_id=beauty.auth_id() AND u.status='active')
 OR (sharing AND expires_at>now() AND last_observed_at>now()-interval '90 seconds'
 AND (SELECT journey_sharing FROM beauty.arrival_settings)
 AND EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.id=booking_id AND b.status='confirmed'))
);
-- Feature switches apply to direct writes as well as the HTTP route.
CREATE POLICY arrival_location_enabled_insert ON beauty.booking_location_sessions AS RESTRICTIVE FOR INSERT TO beauty_app WITH CHECK((SELECT journey_sharing FROM beauty.arrival_settings));
CREATE POLICY arrival_location_enabled_update ON beauty.booking_location_sessions AS RESTRICTIVE FOR UPDATE TO beauty_app USING(true) WITH CHECK(NOT sharing OR (SELECT journey_sharing FROM beauty.arrival_settings));
-- Record that the browser displayed a version separately from an explicit
-- acknowledgement. This is telemetry, never a claim the notice was read.
ALTER TABLE beauty.appointment_arrival_events DROP CONSTRAINT appointment_arrival_events_kind_check;
ALTER TABLE beauty.appointment_arrival_events ADD CHECK(kind IN('configured','shown','acknowledged','consent_enabled','consent_stopped','detected','manual','attendance','started','dispute','correction','late','plan_saved','reminders_stopped','sharing_started','sharing_stopped'));
CREATE FUNCTION beauty.arrival_prompt_shown(target uuid,version integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb:=beauty.policy_booking_actor(target); BEGIN
 IF (identity->>'professional')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM beauty.bookings WHERE id=target FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM beauty.appointment_arrivals a WHERE a.booking_id=target AND a.version=arrival_prompt_shown.version) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM beauty.appointment_arrival_events e WHERE e.booking_id=target AND e.kind='shown' AND e.details->>'version'=version::text) THEN
  INSERT INTO beauty.appointment_arrival_events(booking_id,actor_id,kind,details) VALUES(target,(identity->>'actor')::uuid,'shown',jsonb_build_object('version',version,'source','browser_reported_display'));
 END IF;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.arrival_prompt_shown(uuid,integer) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.arrival_prompt_shown(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.arrival_prompt_shown(uuid,integer) TO beauty_app;
-- Leave existing push payloads unchanged; departure reminders can supply a
-- safe lock-screen heading, without an address or identifiable service details.
CREATE FUNCTION beauty.push_departure_heading(target uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT title FROM beauty.in_app_notifications WHERE id=target AND kind='journey_departure' AND title IN('Leave in approximately 15 minutes','Leave in approximately 5 minutes','It’s time to leave for your appointment')
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_notification_ops;
ALTER FUNCTION beauty.push_departure_heading(uuid) OWNER TO beauty_notification_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_notification_ops;
REVOKE ALL ON FUNCTION beauty.push_departure_heading(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.push_departure_heading(uuid) TO beauty_payment_worker;
CREATE FUNCTION beauty.record_journey_sharing_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event uuid; recipient uuid; started boolean:=NEW.sharing AND (TG_OP='INSERT' OR NOT OLD.sharing); BEGIN
 IF started OR (TG_OP='UPDATE' AND OLD.sharing AND NOT NEW.sharing) THEN
  INSERT INTO beauty.appointment_arrival_events(booking_id,actor_id,kind,details) VALUES(NEW.booking_id,NEW.customer_id,CASE WHEN started THEN 'sharing_started' ELSE 'sharing_stopped' END,jsonb_build_object('consentVersion',NEW.consent_version,'expiresAt',NEW.expires_at)) RETURNING id INTO event;
  SELECT user_id INTO recipient FROM beauty.professional_profiles WHERE id=NEW.professional_id;
  PERFORM beauty.arrival_notify(NEW.booking_id,recipient,'Journey sharing status',CASE WHEN started THEN 'The customer voluntarily started sharing a journey for this appointment. Access expires with the appointment and stale positions are hidden.' ELSE 'Journey sharing has stopped or expired. Live location access has ended.' END,'journey-sharing:'||event);
 END IF;RETURN NEW;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.record_journey_sharing_change() OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.record_journey_sharing_change() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER record_journey_sharing_change AFTER INSERT OR UPDATE OF sharing ON beauty.booking_location_sessions FOR EACH ROW EXECUTE FUNCTION beauty.record_journey_sharing_change();
CREATE FUNCTION beauty.admin_arrival_resend(target uuid,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_admin(); n beauty.in_app_notifications; o beauty.notification_outbox; BEGIN
 SELECT * INTO n FROM beauty.in_app_notifications WHERE id=target FOR UPDATE;
 SELECT * INTO o FROM beauty.notification_outbox WHERE notification_id=target;
 IF n.kind<>'arrival_update' OR n.id IS NULL OR o.delivered_at IS NOT NULL OR o.claimed_until>now() OR (coalesce(o.last_error,'')='' AND n.created_at>now()-interval '15 minutes') OR length(trim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM beauty.in_app_notifications WHERE event_key='arrival-resend:'||target AND created_at>now()-interval '15 minutes') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM beauty.arrival_notify(n.booking_id,n.user_id,n.title,n.body,'arrival-resend:'||target);
 PERFORM beauty.write_admin_audit(actor,'admin','arrival.resend',n.user_id,'notification',target,reason,'{}');
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.admin_arrival_resend(uuid,text) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.admin_arrival_resend(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.admin_arrival_resend(uuid,text) TO beauty_app;
CREATE FUNCTION beauty.arrival_scheduler_tick() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE beauty.arrival_settings SET scheduler_tick_at=now()
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.arrival_scheduler_tick() OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.arrival_scheduler_tick() FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.arrival_scheduler_tick() TO beauty_payment_worker;
CREATE FUNCTION beauty.my_arrival_summaries() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid:=beauty.policy_actor_professional(); BEGIN
 RETURN coalesce((SELECT jsonb_object_agg(b.id,jsonb_build_object('detectedAt',a.detected_at,'manualAt',a.manual_at,'attendanceAt',a.attendance_at,
 'sharing',coalesce(s.journey_sharing AND live.sharing AND live.expires_at>now() AND live.last_observed_at>now()-interval '90 seconds' AND b.status='confirmed',false),
 'late',EXISTS(SELECT 1 FROM beauty.appointment_arrival_events e WHERE e.booking_id=b.id AND e.kind='late'),
 'eta',(SELECT e.details->>'eta' FROM beauty.appointment_arrival_events e WHERE e.booking_id=b.id AND e.kind='late' ORDER BY created_at DESC LIMIT 1)))
 FROM (SELECT id,status FROM beauty.bookings WHERE professional_id=pro ORDER BY (ends_at>now() AND status='confirmed') DESC,starts_at ASC LIMIT 100) b
 LEFT JOIN beauty.appointment_arrivals a ON a.booking_id=b.id LEFT JOIN beauty.booking_location_sessions live ON live.booking_id=b.id CROSS JOIN beauty.arrival_settings s
 WHERE s.smart_arrival OR s.journey_planner OR a.booking_id IS NOT NULL),'{}');
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.my_arrival_summaries() OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.my_arrival_summaries() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.my_arrival_summaries() TO beauty_app;

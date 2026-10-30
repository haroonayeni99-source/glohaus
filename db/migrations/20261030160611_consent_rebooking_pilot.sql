-- Opt-in-only rebooking pilot. Disabled by default; no imported contacts.
CREATE TABLE beauty.rebooking_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,
 delay_days integer NOT NULL DEFAULT 28 CHECK(delay_days BETWEEN 14 AND 180),
 cooldown_days integer NOT NULL DEFAULT 30 CHECK(cooldown_days BETWEEN 7 AND 180),
 daily_cap integer NOT NULL DEFAULT 25 CHECK(daily_cap BETWEEN 0 AND 500),
 monthly_cap integer NOT NULL DEFAULT 100 CHECK(monthly_cap BETWEEN 0 AND 5000),
 updated_by uuid REFERENCES beauty.users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO beauty.rebooking_settings DEFAULT VALUES;
CREATE TABLE beauty.rebooking_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL UNIQUE REFERENCES beauty.bookings(id),
 recipient_user_id uuid NOT NULL REFERENCES beauty.users(id),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sent','suppressed','failed')),
 rule_snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),due_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,first_attempt_at timestamptz,claimed_until timestamptz,sent_at timestamptz,provider_email_id text,recipient_email text,delivery_status text
);
CREATE TABLE beauty.rebooking_delivery_events(event_id text PRIMARY KEY,job_id uuid NOT NULL REFERENCES beauty.rebooking_outbox(id),event_type text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX rebooking_due ON beauty.rebooking_outbox(due_at) WHERE state='pending';
CREATE INDEX rebooking_customer_frequency ON beauty.rebooking_outbox(recipient_user_id,created_at DESC);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['rebooking_settings','rebooking_outbox','rebooking_delivery_events'] LOOP
 EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON beauty.%I TO beauty_admin_ops',t);
 EXECUTE format('CREATE POLICY rebooking_ops ON beauty.%I TO beauty_admin_ops USING(true) WITH CHECK(true)',t);
 END LOOP;END $$;
-- Only the internal role can inspect blocks; callers receive no block details.
GRANT SELECT ON beauty.professional_client_blocks TO beauty_admin_ops;
CREATE POLICY rebooking_block_check ON beauty.professional_client_blocks FOR SELECT TO beauty_admin_ops USING(true);
CREATE FUNCTION beauty.rebooking_eligible(target uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM beauty.bookings b
 JOIN beauty.users u ON u.id=b.customer_id JOIN beauty.professional_profiles p ON p.id=b.professional_id
 JOIN beauty.users pro ON pro.id=p.user_id JOIN beauty.services service ON service.id=b.service_id AND service.active
 JOIN beauty.marketing_preferences pref ON pref.user_id=u.id AND pref.rebooking
 JOIN beauty.payments pay ON pay.booking_id=b.id CROSS JOIN beauty.rebooking_settings rules
 WHERE b.id=target AND b.status='completed' AND b.completed_at<=now()-rules.delay_days*interval '1 day'
 AND b.completed_at>=now()-(rules.delay_days+7)*interval '1 day'
 AND pay.captured_pence>0 AND pay.refunded_pence=0
 AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())
 AND pro.status='active' AND pro.deleted_at IS NULL AND (pro.restricted_until IS NULL OR pro.restricted_until<=now())
 AND EXISTS(SELECT 1 FROM beauty.public_professionals visible WHERE visible.id=p.id)
 AND NOT EXISTS(SELECT 1 FROM beauty.email_suppressions s WHERE lower(s.email)=lower(u.email))
 AND NOT EXISTS(SELECT 1 FROM beauty.booking_disputes d WHERE d.booking_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM beauty.professional_client_blocks cb WHERE cb.professional_id=p.id AND cb.customer_id=u.id AND cb.blocked)
 AND NOT EXISTS(SELECT 1 FROM beauty.bookings future WHERE future.professional_id=p.id AND future.customer_id=u.id AND future.starts_at>now() AND (future.status='confirmed' OR (future.status='payment_pending' AND future.hold_expires_at>now())))
 AND NOT EXISTS(SELECT 1 FROM beauty.bookings later WHERE later.professional_id=p.id AND later.customer_id=u.id AND later.status='completed' AND later.completed_at>b.completed_at AND later.completed_at<=now())
 );
$$;
CREATE FUNCTION beauty.prepare_rebooking_emails() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rules beauty.rebooking_settings; b beauty.bookings; added integer:=0; daily integer; monthly integer; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('glohaus-rebooking-pilot',0));SELECT * INTO rules FROM beauty.rebooking_settings WHERE singleton FOR UPDATE;
 IF NOT rules.enabled THEN RETURN 0;END IF;
 SELECT count(*) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'),count(*)
 INTO daily,monthly FROM beauty.rebooking_outbox WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London';
 FOR b IN SELECT candidate.* FROM beauty.bookings candidate WHERE candidate.status='completed' AND candidate.completed_at<=now()-rules.delay_days*interval '1 day'
 AND candidate.completed_at>=now()-(rules.delay_days+7)*interval '1 day' AND beauty.rebooking_eligible(candidate.id)
 AND NOT EXISTS(SELECT 1 FROM beauty.rebooking_outbox queued WHERE queued.booking_id=candidate.id OR (queued.recipient_user_id=candidate.customer_id AND queued.created_at>now()-rules.cooldown_days*interval '1 day')) ORDER BY candidate.completed_at DESC,candidate.id LIMIT 500 LOOP
  EXIT WHEN daily+added>=rules.daily_cap OR monthly+added>=rules.monthly_cap;
  IF NOT beauty.rebooking_eligible(b.id) OR EXISTS(SELECT 1 FROM beauty.rebooking_outbox o WHERE o.booking_id=b.id OR (o.recipient_user_id=b.customer_id AND o.created_at>now()-rules.cooldown_days*interval '1 day')) THEN CONTINUE;END IF;
  INSERT INTO beauty.rebooking_outbox(booking_id,recipient_user_id,professional_id,rule_snapshot) VALUES(b.id,b.customer_id,b.professional_id,to_jsonb(rules)-'updated_by'-'singleton');added:=added+1;
 END LOOP;RETURN added;
END $$;
CREATE FUNCTION beauty.claim_rebooking_emails() RETURNS TABLE(id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.rebooking_settings WHERE singleton AND enabled) THEN RETURN;END IF;
 UPDATE beauty.rebooking_outbox o SET state='suppressed',claimed_until=NULL WHERE o.state='pending' AND NOT beauty.rebooking_eligible(o.booking_id);
 UPDATE beauty.rebooking_outbox o SET state='failed',claimed_until=NULL WHERE o.state='pending' AND (o.first_attempt_at<=now()-interval '23 hours' OR o.attempts>=3) AND (o.claimed_until IS NULL OR o.claimed_until<now());
 RETURN QUERY WITH selected AS(SELECT o.id FROM beauty.rebooking_outbox o WHERE o.state='pending' AND o.due_at<=now() AND o.attempts<3 AND (o.claimed_until IS NULL OR o.claimed_until<now()) ORDER BY o.due_at,o.id LIMIT 10 FOR UPDATE SKIP LOCKED)
 UPDATE beauty.rebooking_outbox o SET attempts=o.attempts+1,first_attempt_at=coalesce(o.first_attempt_at,now()),claimed_until=now()+interval '5 minutes' FROM selected WHERE o.id=selected.id RETURNING o.id;
END $$;
CREATE FUNCTION beauty.rebooking_email_before_send(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job beauty.rebooking_outbox;recipient text; BEGIN
 SELECT * INTO job FROM beauty.rebooking_outbox WHERE id=target AND state='pending' AND claimed_until>now() AND first_attempt_at>now()-interval '23 hours' FOR UPDATE;
 IF job.id IS NULL THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM beauty.rebooking_settings WHERE singleton AND enabled) OR NOT beauty.rebooking_eligible(job.booking_id) THEN UPDATE beauty.rebooking_outbox SET state='suppressed',claimed_until=NULL WHERE id=target;RETURN NULL;END IF;
 UPDATE beauty.rebooking_outbox o SET recipient_email=(SELECT u.email FROM beauty.users u WHERE u.id=o.recipient_user_id) WHERE o.id=target RETURNING recipient_email INTO recipient;
 RETURN (SELECT jsonb_build_object('id',job.id,'email',recipient,'businessName',p.business_name,'slug',p.slug,'unsubscribeToken',pref.unsubscribe_token) FROM beauty.users u JOIN beauty.marketing_preferences pref ON pref.user_id=u.id JOIN beauty.professional_profiles p ON p.id=job.professional_id WHERE u.id=job.recipient_user_id);
END $$;
CREATE FUNCTION beauty.finish_rebooking_email(target uuid,provider_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE beauty.rebooking_outbox SET state=CASE WHEN provider_id IS NOT NULL THEN 'sent' ELSE state END,sent_at=CASE WHEN provider_id IS NOT NULL THEN now() ELSE sent_at END,provider_email_id=coalesce(provider_id,provider_email_id),delivery_status=CASE WHEN provider_id IS NOT NULL THEN coalesce(delivery_status,'accepted') ELSE delivery_status END,claimed_until=NULL,due_at=CASE WHEN provider_id IS NULL THEN now()+interval '15 minutes' ELSE due_at END WHERE id=target AND sent_at IS NULL;
END $$;
GRANT INSERT,UPDATE ON beauty.email_suppressions TO beauty_admin_ops;
CREATE POLICY rebooking_suppression_insert ON beauty.email_suppressions FOR INSERT TO beauty_admin_ops WITH CHECK(true);
CREATE POLICY rebooking_suppression_update ON beauty.email_suppressions FOR UPDATE TO beauty_admin_ops USING(true) WITH CHECK(true);
CREATE FUNCTION beauty.record_rebooking_email_event(event_id text,target uuid,provider_id text,event_type text,recipient text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job beauty.rebooking_outbox; outcome text;BEGIN
outcome:=CASE event_type WHEN 'email.delivered' THEN 'delivered' WHEN 'email.bounced' THEN 'bounced' WHEN 'email.complained' THEN 'complained' WHEN 'email.failed' THEN 'failed' WHEN 'email.suppressed' THEN 'suppressed' END;
IF outcome IS NULL OR provider_id IS NULL OR length(provider_id)=0 THEN RETURN false;END IF;
SELECT * INTO job FROM beauty.rebooking_outbox WHERE id=target AND first_attempt_at IS NOT NULL AND recipient_email IS NOT NULL AND lower(recipient_email)=lower(recipient) AND (provider_email_id IS NULL OR provider_email_id=provider_id) FOR UPDATE;
IF job.id IS NULL THEN RETURN false;END IF;
INSERT INTO beauty.rebooking_delivery_events(event_id,job_id,event_type) VALUES(event_id,target,event_type) ON CONFLICT DO NOTHING;IF NOT FOUND THEN RETURN false;END IF;
-- Verified provider evidence can arrive before the send response is recorded.
UPDATE beauty.rebooking_outbox SET provider_email_id=provider_id,state='sent',sent_at=coalesce(sent_at,now()),delivery_status=CASE WHEN delivery_status IN('bounced','complained','suppressed') THEN delivery_status ELSE outcome END,claimed_until=NULL WHERE id=target;
IF outcome IN('bounced','complained','suppressed') THEN INSERT INTO beauty.email_suppressions(email,reason,provider_email_id) VALUES(lower(recipient),outcome,provider_id) ON CONFLICT(email) DO UPDATE SET reason=excluded.reason,provider_email_id=excluded.provider_email_id,updated_at=now();END IF;
RETURN true;END $$;
CREATE FUNCTION beauty.owner_rebooking_settings(payload jsonb,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN actor:=beauty.require_owner();
 IF payload-ARRAY['enabled','delayDays','cooldownDays','dailyCap','monthlyCap']<>'{}'::jsonb OR jsonb_typeof(payload->'enabled') IS DISTINCT FROM 'boolean' OR (payload->>'delayDays')::integer NOT BETWEEN 14 AND 180 OR (payload->>'cooldownDays')::integer NOT BETWEEN 7 AND 180 OR (payload->>'dailyCap')::integer NOT BETWEEN 0 AND 500 OR (payload->>'monthlyCap')::integer NOT BETWEEN 0 AND 5000 OR length(trim(coalesce(reason,''))) NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
 UPDATE beauty.rebooking_settings SET enabled=(payload->>'enabled')::boolean,delay_days=(payload->>'delayDays')::integer,cooldown_days=(payload->>'cooldownDays')::integer,daily_cap=(payload->>'dailyCap')::integer,monthly_cap=(payload->>'monthlyCap')::integer,updated_by=actor,updated_at=now() WHERE singleton;
 -- Stopping cancels waiting jobs; enabling never resurrects them.
 IF NOT (payload->>'enabled')::boolean THEN UPDATE beauty.rebooking_outbox SET state='suppressed',claimed_until=NULL WHERE state='pending';END IF;
 PERFORM beauty.write_admin_audit(actor,'owner','rebooking_settings_updated',actor,'platform_setting',NULL,trim(reason),payload);
END $$;
CREATE FUNCTION beauty.owner_rebooking_stop() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN actor:=beauty.require_owner();UPDATE beauty.rebooking_settings SET enabled=false,updated_by=actor,updated_at=now() WHERE singleton;
UPDATE beauty.rebooking_outbox SET state='suppressed',claimed_until=NULL WHERE state='pending';
PERFORM beauty.write_admin_audit(actor,'owner','rebooking_emergency_stop',actor,'platform_setting',NULL,'Owner emergency stop',jsonb_build_object('enabled',false));END $$;
CREATE FUNCTION beauty.owner_rebooking_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM beauty.require_owner();RETURN jsonb_build_object('settings',(SELECT to_jsonb(s)-'singleton'-'updated_by' FROM beauty.rebooking_settings s),
 'counts',(SELECT jsonb_build_object('pending',count(*) FILTER(WHERE state='pending'),'sent',count(*) FILTER(WHERE state='sent'),'suppressed',count(*) FILTER(WHERE state='suppressed'),'failed',count(*) FILTER(WHERE state='failed')) FROM beauty.rebooking_outbox),
 'eligibleNow',(SELECT count(*) FROM beauty.bookings b CROSS JOIN beauty.rebooking_settings s WHERE b.status='completed' AND b.completed_at BETWEEN now()-(s.delay_days+7)*interval '1 day' AND now()-s.delay_days*interval '1 day' AND beauty.rebooking_eligible(b.id) AND NOT EXISTS(SELECT 1 FROM beauty.rebooking_outbox o WHERE o.booking_id=b.id OR(o.recipient_user_id=b.customer_id AND o.created_at>now()-s.cooldown_days*interval '1 day'))));END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.rebooking_eligible(uuid) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.prepare_rebooking_emails() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.claim_rebooking_emails() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.rebooking_email_before_send(uuid) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.finish_rebooking_email(uuid,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.record_rebooking_email_event(text,uuid,text,text,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_rebooking_settings(jsonb,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_rebooking_stop() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_rebooking_overview() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.rebooking_eligible(uuid),beauty.prepare_rebooking_emails(),beauty.claim_rebooking_emails(),beauty.rebooking_email_before_send(uuid),beauty.finish_rebooking_email(uuid,text),beauty.record_rebooking_email_event(text,uuid,text,text,text),beauty.owner_rebooking_settings(jsonb,text),beauty.owner_rebooking_stop(),beauty.owner_rebooking_overview() FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.prepare_rebooking_emails(),beauty.claim_rebooking_emails(),beauty.rebooking_email_before_send(uuid),beauty.finish_rebooking_email(uuid,text),beauty.record_rebooking_email_event(text,uuid,text,text,text) TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.owner_rebooking_settings(jsonb,text),beauty.owner_rebooking_stop(),beauty.owner_rebooking_overview() TO beauty_app;

-- Reviewed candidate patch for the isolated rebooking pilot.
-- Not part of the production migration plan. Package as a generated migration
-- after review; never apply to production without a verified restorable backup.
CREATE TABLE beauty.rebooking_professional_settings (
 professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
 paused boolean NOT NULL DEFAULT true,
 delay_days integer NOT NULL DEFAULT 28 CHECK(delay_days BETWEEN 14 AND 180),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.rebooking_service_intervals (
 service_id uuid PRIMARY KEY REFERENCES beauty.services(id),
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 delay_days integer NOT NULL CHECK(delay_days BETWEEN 14 AND 180),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rebooking_intervals_professional ON beauty.rebooking_service_intervals(professional_id);
CREATE TABLE beauty.rebooking_customer_consents (
 user_id uuid NOT NULL REFERENCES beauty.users(id),
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 channel text NOT NULL DEFAULT 'email' CHECK(channel='email'),
 enabled boolean NOT NULL DEFAULT false,
 consent_version text NOT NULL DEFAULT 'named-professional-email-v1' CHECK(consent_version='named-professional-email-v1'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,professional_id,channel)
);
CREATE INDEX rebooking_consents_professional ON beauty.rebooking_customer_consents(professional_id);
CREATE TABLE beauty.rebooking_scope_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_user_id uuid NOT NULL REFERENCES beauty.users(id),
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 kind text NOT NULL CHECK(kind IN('customer_consent','professional_settings','service_interval')),
 details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rebooking_scope_actor ON beauty.rebooking_scope_events(actor_user_id,created_at);
CREATE INDEX rebooking_scope_professional ON beauty.rebooking_scope_events(professional_id,created_at);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['rebooking_professional_settings','rebooking_service_intervals','rebooking_customer_consents','rebooking_scope_events'] LOOP
 EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON beauty.%I TO beauty_admin_ops',t);
 EXECUTE format('CREATE POLICY rebooking_scope_ops ON beauty.%I TO beauty_admin_ops USING(true) WITH CHECK(true)',t);
END LOOP;END $$;
GRANT DELETE ON beauty.rebooking_service_intervals TO beauty_admin_ops;
REVOKE UPDATE ON beauty.rebooking_scope_events FROM beauty_admin_ops;
CREATE FUNCTION beauty.rebooking_scope_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'APPEND_ONLY' USING ERRCODE='23514';END $$;
CREATE TRIGGER rebooking_scope_history BEFORE UPDATE OR DELETE ON beauty.rebooking_scope_events FOR EACH ROW EXECUTE FUNCTION beauty.rebooking_scope_immutable();
CREATE FUNCTION beauty.rebooking_delivery_window(at_time timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT (at_time AT TIME ZONE 'Europe/London')::time >= time '09:00' AND (at_time AT TIME ZONE 'Europe/London')::time < time '20:00';
$$;
CREATE FUNCTION beauty.rebooking_effective_delay(target uuid) RETURNS integer LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(si.delay_days,ps.delay_days,r.delay_days) FROM beauty.bookings b
 CROSS JOIN beauty.rebooking_settings r
 LEFT JOIN beauty.rebooking_professional_settings ps ON ps.professional_id=b.professional_id
 LEFT JOIN beauty.rebooking_service_intervals si ON si.service_id=b.service_id AND si.professional_id=b.professional_id
 WHERE b.id=target;
$$;
CREATE FUNCTION beauty.rebooking_scope_actor() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN
 SELECT u.id INTO actor FROM beauty.users u WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now());
 IF actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';END IF;RETURN actor;
END $$;
CREATE FUNCTION beauty.my_rebooking_consents() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN actor:=beauty.rebooking_scope_actor();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('professionalId',p.id,'businessName',p.business_name,'channel','email','enabled',coalesce(c.enabled,false)) ORDER BY p.business_name,p.id)
 FROM beauty.professional_profiles p LEFT JOIN beauty.rebooking_customer_consents c ON c.professional_id=p.id AND c.user_id=actor AND c.channel='email'
 WHERE EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.payments pay ON pay.booking_id=b.id WHERE b.customer_id=actor AND b.professional_id=p.id AND b.status='completed' AND pay.captured_pence>0)
 OR c.user_id IS NOT NULL),'[]'::jsonb);
END $$;
CREATE FUNCTION beauty.set_my_rebooking_consent(target uuid,channel_name text,allow_email boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN actor:=beauty.rebooking_scope_actor();
 IF channel_name IS DISTINCT FROM 'email' OR allow_email IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.payments pay ON pay.booking_id=b.id WHERE b.customer_id=actor AND b.professional_id=target AND b.status='completed' AND pay.captured_pence>0)
 AND NOT EXISTS(SELECT 1 FROM beauty.rebooking_customer_consents c WHERE c.user_id=actor AND c.professional_id=target) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 INSERT INTO beauty.rebooking_customer_consents(user_id,professional_id,channel,enabled) VALUES(actor,target,channel_name,allow_email)
 ON CONFLICT(user_id,professional_id,channel) DO UPDATE SET enabled=excluded.enabled,updated_at=now();
 INSERT INTO beauty.rebooking_scope_events(actor_user_id,professional_id,kind,details) VALUES(actor,target,'customer_consent',jsonb_build_object('channel',channel_name,'enabled',allow_email,'consentVersion','named-professional-email-v1'));
 IF NOT allow_email THEN UPDATE beauty.rebooking_outbox SET state='suppressed',claimed_until=NULL WHERE recipient_user_id=actor AND professional_id=target AND state='pending';END IF;
END $$;
CREATE FUNCTION beauty.my_professional_rebooking() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;pro uuid;BEGIN actor:=beauty.rebooking_scope_actor();SELECT id INTO pro FROM beauty.professional_profiles WHERE user_id=actor;
 IF pro IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('paused',coalesce((SELECT paused FROM beauty.rebooking_professional_settings WHERE professional_id=pro),true),'delayDays',coalesce((SELECT delay_days FROM beauty.rebooking_professional_settings WHERE professional_id=pro),28),
 'services',coalesce((SELECT jsonb_agg(jsonb_build_object('serviceId',s.id,'name',s.name,'delayDays',si.delay_days) ORDER BY s.name,s.id) FROM beauty.services s LEFT JOIN beauty.rebooking_service_intervals si ON si.service_id=s.id AND si.professional_id=pro WHERE s.professional_id=pro AND s.active),'[]'::jsonb));
END $$;
CREATE FUNCTION beauty.set_my_professional_rebooking(payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;pro uuid;days integer;target uuid;BEGIN actor:=beauty.rebooking_scope_actor();SELECT id INTO pro FROM beauty.professional_profiles WHERE user_id=actor;
 IF pro IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
 IF payload ? 'serviceId' THEN
  IF payload-ARRAY['serviceId','delayDays']<>'{}'::jsonb OR NOT payload ? 'delayDays' THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  target:=(payload->>'serviceId')::uuid;days:=(payload->>'delayDays')::integer;
  IF NOT EXISTS(SELECT 1 FROM beauty.services WHERE id=target AND professional_id=pro) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  IF days IS NULL THEN DELETE FROM beauty.rebooking_service_intervals WHERE service_id=target AND professional_id=pro;
  ELSIF days BETWEEN 14 AND 180 THEN INSERT INTO beauty.rebooking_service_intervals(service_id,professional_id,delay_days) VALUES(target,pro,days) ON CONFLICT(service_id) DO UPDATE SET delay_days=excluded.delay_days,updated_at=now();
  ELSE RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  INSERT INTO beauty.rebooking_scope_events(actor_user_id,professional_id,kind,details) VALUES(actor,pro,'service_interval',payload);
 ELSE
  days:=(payload->>'delayDays')::integer;
  IF payload-ARRAY['paused','delayDays']<>'{}'::jsonb OR jsonb_typeof(payload->'paused') IS DISTINCT FROM 'boolean' OR days IS NULL OR days NOT BETWEEN 14 AND 180 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  INSERT INTO beauty.rebooking_professional_settings(professional_id,paused,delay_days) VALUES(pro,(payload->>'paused')::boolean,days)
  ON CONFLICT(professional_id) DO UPDATE SET paused=excluded.paused,delay_days=excluded.delay_days,updated_at=now();
  INSERT INTO beauty.rebooking_scope_events(actor_user_id,professional_id,kind,details) VALUES(actor,pro,'professional_settings',payload);
  IF (payload->>'paused')::boolean THEN UPDATE beauty.rebooking_outbox SET state='suppressed',claimed_until=NULL WHERE professional_id=pro AND state='pending';END IF;
 END IF;
END $$;
-- Preserve all existing qualification exclusions and add the narrower scopes.
DO $patch$
DECLARE fn text;next_fn text;BEGIN
 SELECT pg_get_functiondef('beauty.rebooking_eligible(uuid)'::regprocedure) INTO fn;
 IF position('CROSS JOIN beauty.rebooking_settings rules' IN fn)=0 OR position('rules.delay_days*interval' IN fn)=0 OR position('(rules.delay_days+7)*interval' IN fn)=0 THEN RAISE EXCEPTION 'Unexpected rebooking eligibility scope or interval';END IF;
 next_fn:=replace(fn,'CROSS JOIN beauty.rebooking_settings rules','JOIN beauty.rebooking_professional_settings ps ON ps.professional_id=p.id AND NOT ps.paused JOIN beauty.rebooking_customer_consents consent ON consent.professional_id=p.id AND consent.user_id=u.id AND consent.channel=''email'' AND consent.enabled CROSS JOIN beauty.rebooking_settings rules');
 next_fn:=replace(next_fn,'rules.delay_days*interval','beauty.rebooking_effective_delay(b.id)*interval');
 next_fn:=replace(next_fn,'(rules.delay_days+7)*interval','(beauty.rebooking_effective_delay(b.id)+7)*interval');
 IF next_fn=fn THEN RAISE EXCEPTION 'Unexpected rebooking eligibility definition';END IF;EXECUTE next_fn;
 SELECT pg_get_functiondef('beauty.prepare_rebooking_emails()'::regprocedure) INTO fn;
 IF position('candidate.completed_at<=now()-rules.delay_days*interval ''1 day''' IN fn)=0 OR position('candidate.completed_at>=now()-(rules.delay_days+7)*interval ''1 day''' IN fn)=0 OR position($old$to_jsonb(rules)-'updated_by'-'singleton'$old$ IN fn)=0 THEN RAISE EXCEPTION 'Unexpected rebooking preparation interval';END IF;
 next_fn:=replace(fn,'candidate.completed_at<=now()-rules.delay_days*interval ''1 day''','true');
 next_fn:=replace(next_fn,'candidate.completed_at>=now()-(rules.delay_days+7)*interval ''1 day''','true');
 next_fn:=replace(next_fn,$old$to_jsonb(rules)-'updated_by'-'singleton'$old$,$new$(to_jsonb(rules)-'updated_by'-'singleton')||jsonb_build_object('effectiveDelayDays',beauty.rebooking_effective_delay(b.id),'consentVersion','named-professional-email-v1')$new$);
 IF next_fn=fn THEN RAISE EXCEPTION 'Unexpected rebooking preparation definition';END IF;EXECUTE next_fn;
 SELECT pg_get_functiondef('beauty.claim_rebooking_emails()'::regprocedure) INTO fn;
 next_fn:=replace(fn,'IF NOT EXISTS(SELECT 1 FROM beauty.rebooking_settings','IF NOT beauty.rebooking_delivery_window(now()) THEN RETURN;END IF; IF NOT EXISTS(SELECT 1 FROM beauty.rebooking_settings');
 IF next_fn=fn THEN RAISE EXCEPTION 'Unexpected rebooking claim definition';END IF;EXECUTE next_fn;
 SELECT pg_get_functiondef('beauty.rebooking_email_before_send(uuid)'::regprocedure) INTO fn;
 next_fn:=replace(fn,'SELECT * INTO job FROM beauty.rebooking_outbox','IF NOT beauty.rebooking_delivery_window(now()) THEN RETURN NULL;END IF; SELECT * INTO job FROM beauty.rebooking_outbox');
 IF next_fn=fn THEN RAISE EXCEPTION 'Unexpected rebooking preflight definition';END IF;EXECUTE next_fn;
 SELECT pg_get_functiondef('beauty.owner_rebooking_overview()'::regprocedure) INTO fn;
 next_fn:=replace(fn,'b.completed_at BETWEEN now()-(s.delay_days+7)*interval ''1 day'' AND now()-s.delay_days*interval ''1 day''','true');
 IF next_fn=fn THEN RAISE EXCEPTION 'Unexpected rebooking overview definition';END IF;EXECUTE next_fn;
END $patch$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
DO $$ DECLARE f regprocedure;BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname IN ('rebooking_scope_immutable','rebooking_delivery_window','rebooking_effective_delay','rebooking_scope_actor','my_rebooking_consents','set_my_rebooking_consent','my_professional_rebooking','set_my_professional_rebooking') LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO beauty_admin_ops',f);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker',f);
END LOOP;END $$;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
GRANT EXECUTE ON FUNCTION beauty.my_rebooking_consents(),beauty.set_my_rebooking_consent(uuid,text,boolean),beauty.my_professional_rebooking(),beauty.set_my_professional_rebooking(jsonb) TO beauty_app;

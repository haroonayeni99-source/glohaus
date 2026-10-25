-- Private email transport metadata only; no email bodies, secrets, payment or booking changes.
CREATE ROLE beauty_support_mail_ops NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT beauty_support_mail_ops TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_support_mail_ops;
GRANT EXECUTE ON FUNCTION beauty.require_owner() TO beauty_support_mail_ops;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_support_mail_ops;
GRANT SELECT(id,auth_id,status) ON beauty.users TO beauty_support_mail_ops;
GRANT SELECT(user_id,role) ON beauty.user_roles TO beauty_support_mail_ops;
CREATE POLICY support_mail_owner_identity ON beauty.users FOR SELECT TO beauty_support_mail_ops USING(true);
CREATE POLICY support_mail_owner_role ON beauty.user_roles FOR SELECT TO beauty_support_mail_ops USING(true);
CREATE TABLE beauty.support_mail_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_email_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN('received','sent')),
 queued_by uuid REFERENCES beauty.users(id), thread_id uuid, state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','processing','retry','forwarded','linked','quarantined','ignored','failed')),
 sender_key text, reason text CHECK(length(reason)<=80), fingerprint text UNIQUE CHECK(fingerprint ~ '^[a-f0-9]{64}$'), request_id uuid REFERENCES beauty.support_requests(id),
 attempts integer NOT NULL DEFAULT 0, first_attempt_at timestamptz, available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, lease uuid,
 provider_send_id uuid, delivery_state text, delivery_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_email_id,kind)
);
CREATE INDEX support_mail_pending ON beauty.support_mail_jobs(available_at,created_at) WHERE state IN('queued','retry','processing');
CREATE INDEX support_mail_case ON beauty.support_mail_jobs(request_id,created_at DESC) WHERE request_id IS NOT NULL;
ALTER TABLE beauty.support_mail_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.support_mail_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.support_mail_jobs FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT,UPDATE ON beauty.support_mail_jobs TO beauty_support_mail_ops;
CREATE POLICY support_mail_private_ops ON beauty.support_mail_jobs TO beauty_support_mail_ops USING(true) WITH CHECK(true);
-- Delivery webhooks can arrive before the sending request has saved its provider ID.
CREATE TABLE beauty.support_mail_delivery (
 provider_email_id uuid PRIMARY KEY, event_type text NOT NULL, event_at timestamptz NOT NULL
);
ALTER TABLE beauty.support_mail_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.support_mail_delivery FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.support_mail_delivery FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT,UPDATE ON beauty.support_mail_delivery TO beauty_support_mail_ops;
CREATE POLICY support_mail_delivery_private ON beauty.support_mail_delivery TO beauty_support_mail_ops USING(true) WITH CHECK(true);
GRANT SELECT(id,email) ON beauty.support_requests TO beauty_support_mail_ops;
CREATE POLICY support_mail_case_match ON beauty.support_requests FOR SELECT TO beauty_support_mail_ops USING(true);

CREATE FUNCTION beauty.queue_support_mail(provider uuid,mail_kind text,thread uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF mail_kind NOT IN('received','sent') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.support_mail_jobs(provider_email_id,kind,thread_id) VALUES(provider,mail_kind,thread)
 ON CONFLICT(provider_email_id,kind) DO UPDATE SET thread_id=coalesce(support_mail_jobs.thread_id,EXCLUDED.thread_id);
END $$;
CREATE FUNCTION beauty.owner_queue_support_mail(provider uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=beauty.require_owner();
 PERFORM beauty.queue_support_mail(provider,'received',NULL);
 UPDATE beauty.support_mail_jobs SET queued_by=coalesce(queued_by,actor) WHERE provider_email_id=provider AND kind='received';
END $$;
CREATE FUNCTION beauty.claim_support_mail() RETURNS TABLE(id uuid,provider_email_id uuid,kind text,thread_id uuid,lease uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Provider idempotency expires after 24h. Stop automatic retries before that point.
 UPDATE beauty.support_mail_jobs SET state='failed',reason='manual_review_required',updated_at=now() WHERE state IN('queued','retry','processing') AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes') AND (attempts>=8 OR first_attempt_at<now()-interval '23 hours');
 IF NOT pg_try_advisory_xact_lock(74201836) OR EXISTS(SELECT 1 FROM beauty.support_mail_jobs WHERE state='processing' AND locked_at>=now()-interval '5 minutes') THEN RETURN; END IF;
 RETURN QUERY WITH batch AS(SELECT j.id FROM beauty.support_mail_jobs j WHERE j.state IN('queued','retry','processing') AND j.available_at<=now() AND (j.locked_at IS NULL OR j.locked_at<now()-interval '5 minutes') ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE beauty.support_mail_jobs j SET state='processing',attempts=j.attempts+1,first_attempt_at=coalesce(j.first_attempt_at,now()),locked_at=now(),lease=gen_random_uuid(),updated_at=now() FROM batch b WHERE j.id=b.id RETURNING j.id,j.provider_email_id,j.kind,j.thread_id,j.lease;
END $$;
CREATE FUNCTION beauty.identify_support_mail(target uuid,claim uuid,mark text,candidate uuid,peer text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job beauty.support_mail_jobs; matched uuid;
BEGIN
 SELECT * INTO job FROM beauty.support_mail_jobs WHERE id=target AND lease=claim AND state='processing' FOR UPDATE;
 IF job.id IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 IF mark IS NOT NULL THEN
  IF mark !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(mark,0));
  IF EXISTS(SELECT 1 FROM beauty.support_mail_jobs WHERE fingerprint=mark AND id<>target) THEN
   UPDATE beauty.support_mail_jobs SET state='ignored',reason='duplicate_message',lease=NULL,locked_at=NULL,updated_at=now() WHERE id=target;
   RETURN jsonb_build_object('duplicate',true,'caseId',NULL);
  END IF;
 END IF;
 IF job.kind='received' AND (
  (SELECT count(*) FROM beauty.support_mail_jobs WHERE sender_key=encode(sha256(convert_to(lower(peer),'UTF8')),'hex') AND state IN('forwarded','processing') AND id<>target AND created_at>now()-interval '1 hour')>=20
  OR (SELECT count(*) FROM beauty.support_mail_jobs WHERE sender_key=encode(sha256(convert_to(lower(peer),'UTF8')),'hex') AND state IN('forwarded','processing') AND id<>target AND created_at>now()-interval '1 day')>=50
 ) THEN
  UPDATE beauty.support_mail_jobs SET state='quarantined',reason='sender_rate_review',lease=NULL,locked_at=NULL,updated_at=now() WHERE id=target;
  RETURN jsonb_build_object('duplicate',false,'held',true,'caseId',NULL);
 END IF;
 -- A reference alone is never sufficient, and linking metadata grants no ticket access.
 IF candidate IS NOT NULL THEN SELECT id INTO matched FROM beauty.support_requests WHERE id=candidate AND lower(email)=lower(peer); END IF;
 IF matched IS NULL AND job.thread_id IS NOT NULL THEN
  SELECT r.id INTO matched FROM beauty.support_mail_jobs prior JOIN beauty.support_requests r ON r.id=prior.request_id
  WHERE prior.thread_id=job.thread_id AND prior.id<>target AND lower(r.email)=lower(peer) ORDER BY prior.created_at LIMIT 1;
 END IF;
 UPDATE beauty.support_mail_jobs SET sender_key=CASE WHEN kind='received' THEN encode(sha256(convert_to(lower(peer),'UTF8')),'hex') ELSE NULL END,fingerprint=coalesce(mark,fingerprint),request_id=matched,updated_at=now() WHERE id=target;
 RETURN jsonb_build_object('duplicate',false,'caseId',matched);
END $$;
CREATE FUNCTION beauty.finish_support_mail(target uuid,claim uuid,result text,code text,provider uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF result NOT IN('retry','forwarded','linked','quarantined','ignored','failed') OR length(coalesce(code,''))>80 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.support_mail_jobs SET state=result,reason=code,provider_send_id=provider,
 available_at=now()+interval '5 minutes'*least(12,power(2,least(attempts,4))::integer),lease=NULL,locked_at=NULL,updated_at=now()
 WHERE id=target AND lease=claim AND state='processing';
 UPDATE beauty.support_mail_jobs j SET delivery_state=d.event_type,delivery_at=d.event_at
 FROM beauty.support_mail_delivery d WHERE j.id=target AND (j.provider_send_id=d.provider_email_id OR (j.kind='sent' AND j.provider_email_id=d.provider_email_id)) AND (j.delivery_at IS NULL OR j.delivery_at<=d.event_at);
END $$;
CREATE FUNCTION beauty.record_support_mail_delivery(provider uuid,delivery_type text,delivery_time timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF delivery_type NOT IN('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed') OR delivery_time IS NULL THEN RETURN; END IF;
 INSERT INTO beauty.support_mail_delivery(provider_email_id,event_type,event_at) VALUES(provider,delivery_type,delivery_time)
 ON CONFLICT(provider_email_id) DO UPDATE SET event_type=EXCLUDED.event_type,event_at=EXCLUDED.event_at WHERE support_mail_delivery.event_at<=EXCLUDED.event_at;
 UPDATE beauty.support_mail_jobs SET delivery_state=delivery_type,delivery_at=delivery_time,updated_at=now()
 WHERE (provider_send_id=provider OR (kind='sent' AND provider_email_id=provider)) AND (delivery_at IS NULL OR delivery_at<=delivery_time);
END
$$;
CREATE FUNCTION beauty.owner_support_mail_overview(target uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_owner();
 RETURN jsonb_build_object('counts',(SELECT coalesce(jsonb_object_agg(state,n),'{}'::jsonb) FROM(SELECT state,count(*) AS n FROM beauty.support_mail_jobs WHERE target IS NULL OR request_id=target GROUP BY state)s),
 'items',(SELECT coalesce(jsonb_agg(j),'[]'::jsonb) FROM(SELECT id,provider_email_id,kind,state,reason,request_id,attempts,delivery_state,created_at FROM beauty.support_mail_jobs WHERE target IS NULL OR request_id=target ORDER BY created_at DESC,id LIMIT 30)j));
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_support_mail_ops;
ALTER FUNCTION beauty.queue_support_mail(uuid,text,uuid) OWNER TO beauty_support_mail_ops;
ALTER FUNCTION beauty.owner_queue_support_mail(uuid) OWNER TO beauty_support_mail_ops;
ALTER FUNCTION beauty.claim_support_mail() OWNER TO beauty_support_mail_ops;
ALTER FUNCTION beauty.identify_support_mail(uuid,uuid,text,uuid,text) OWNER TO beauty_support_mail_ops;
ALTER FUNCTION beauty.finish_support_mail(uuid,uuid,text,text,uuid) OWNER TO beauty_support_mail_ops;
ALTER FUNCTION beauty.record_support_mail_delivery(uuid,text,timestamptz) OWNER TO beauty_support_mail_ops;
ALTER FUNCTION beauty.owner_support_mail_overview(uuid) OWNER TO beauty_support_mail_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_support_mail_ops;
REVOKE ALL ON FUNCTION beauty.owner_queue_support_mail(uuid),beauty.queue_support_mail(uuid,text,uuid),beauty.claim_support_mail(),beauty.identify_support_mail(uuid,uuid,text,uuid,text),beauty.finish_support_mail(uuid,uuid,text,text,uuid),beauty.record_support_mail_delivery(uuid,text,timestamptz),beauty.owner_support_mail_overview(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.queue_support_mail(uuid,text,uuid),beauty.claim_support_mail(),beauty.identify_support_mail(uuid,uuid,text,uuid,text),beauty.finish_support_mail(uuid,uuid,text,text,uuid),beauty.record_support_mail_delivery(uuid,text,timestamptz) TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.owner_support_mail_overview(uuid),beauty.owner_queue_support_mail(uuid) TO beauty_app;

-- Extend the existing private inbox; no Gmail ingestion or mailbox provisioning.
ALTER TABLE beauty.support_requests DROP CONSTRAINT support_requests_status_check;
ALTER TABLE beauty.support_requests ADD CONSTRAINT support_requests_status_check CHECK(status IN('open','under_review','awaiting_customer','escalated','resolved','appealed'));
ALTER TABLE beauty.support_requests ADD COLUMN access_hash text CHECK(access_hash IS NULL OR access_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE beauty.support_requests ADD COLUMN first_response_at timestamptz;
ALTER TABLE beauty.support_requests ADD COLUMN response_due_at timestamptz NOT NULL DEFAULT now()+interval '4 days';
ALTER TABLE beauty.support_request_events DROP CONSTRAINT support_request_events_status_check;
ALTER TABLE beauty.support_request_events ADD CONSTRAINT support_request_events_status_check CHECK(status IN('open','under_review','awaiting_customer','escalated','resolved','appealed'));
ALTER TABLE beauty.support_request_events ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE beauty.support_request_events ADD COLUMN body text NOT NULL DEFAULT '' CHECK(length(body)<=4000);
ALTER TABLE beauty.support_request_events ADD COLUMN public boolean NOT NULL DEFAULT false;
GRANT SELECT,INSERT ON beauty.support_request_events TO beauty_support_intake;
GRANT SELECT ON beauty.support_request_events TO beauty_admin_ops;
CREATE POLICY support_events_intake ON beauty.support_request_events TO beauty_support_intake USING(true) WITH CHECK(true);
CREATE POLICY support_events_admin_read ON beauty.support_request_events FOR SELECT TO beauty_admin_ops USING(true);
GRANT UPDATE(access_hash,response_due_at,status,updated_at) ON beauty.support_requests TO beauty_support_intake;
CREATE POLICY support_intake_update ON beauty.support_requests FOR UPDATE TO beauty_support_intake USING(true) WITH CHECK(true);
GRANT UPDATE(first_response_at,response_due_at) ON beauty.support_requests TO beauty_admin_ops;

CREATE TABLE beauty.support_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES beauty.support_requests(id),
 blob_path text NOT NULL CHECK(blob_path LIKE 'support-evidence/%'),
 caption text NOT NULL CHECK(length(caption) BETWEEN 3 AND 200),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_evidence_request ON beauty.support_evidence(request_id,created_at);
CREATE TABLE beauty.support_email_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES beauty.support_requests(id),
 kind text NOT NULL CHECK(kind IN('new','reply','appeal','escalation')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz,
 accepted_at timestamptz,
 provider_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_email_pending ON beauty.support_email_jobs(available_at) WHERE accepted_at IS NULL;
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT unnest(ARRAY['support_evidence','support_email_jobs']) LOOP
  EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON beauty.support_evidence TO beauty_support_intake;
GRANT SELECT ON beauty.support_evidence TO beauty_admin_ops;
CREATE POLICY support_evidence_intake ON beauty.support_evidence TO beauty_support_intake USING(true) WITH CHECK(true);
CREATE POLICY support_evidence_admin ON beauty.support_evidence FOR SELECT TO beauty_admin_ops USING(true);
GRANT INSERT ON beauty.support_email_jobs TO beauty_support_intake,beauty_admin_ops;
CREATE POLICY support_email_intake ON beauty.support_email_jobs FOR INSERT TO beauty_support_intake WITH CHECK(true);
CREATE POLICY support_email_admin ON beauty.support_email_jobs FOR INSERT TO beauty_admin_ops WITH CHECK(true);
GRANT SELECT,UPDATE ON beauty.support_email_jobs TO beauty_payment_worker;
CREATE POLICY support_email_worker ON beauty.support_email_jobs TO beauty_payment_worker USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.issue_support_access(target uuid,request_rate_key text,token_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE due timestamptz:=now(); workdays integer:=0;
BEGIN
 -- Initial response target: two working days, UK public holidays not included.
 WHILE workdays<2 LOOP due:=due+interval '1 day';IF extract(isodow FROM due AT TIME ZONE 'Europe/London')<6 THEN workdays:=workdays+1;END IF;END LOOP;
 UPDATE beauty.support_requests SET access_hash=token_hash,response_due_at=due
 WHERE id=target AND rate_key=request_rate_key AND created_at>now()-interval '1 minute' AND access_hash IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 INSERT INTO beauty.support_email_jobs(request_id,kind) VALUES(target,'new');
END $$;
CREATE FUNCTION beauty.support_case(target uuid,token_hash text,staff boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ticket beauty.support_requests;
BEGIN
 IF staff THEN PERFORM beauty.require_admin(); END IF;
 SELECT * INTO ticket FROM beauty.support_requests WHERE id=target AND (staff OR (token_hash IS NOT NULL AND access_hash=token_hash));
 IF ticket.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',ticket.id,'topic',ticket.topic,'message',ticket.message,'status',ticket.status,'created_at',ticket.created_at,'response_due_at',ticket.response_due_at,'first_response_at',ticket.first_response_at,
 'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'status',e.status,'body',e.body,'public',e.public,'fromStaff',e.actor_id IS NOT NULL,'created_at',e.created_at) ORDER BY e.created_at,e.id),'[]'::jsonb) FROM beauty.support_request_events e WHERE e.request_id=target AND (staff OR e.public)),
 'evidence',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'caption',e.caption,'created_at',e.created_at) ORDER BY e.created_at),'[]'::jsonb) FROM beauty.support_evidence e WHERE e.request_id=target));
END $$;
-- This scoped routine delegates to the existing admin boundary for staff reads.
GRANT EXECUTE ON FUNCTION beauty.require_admin(),beauty.auth_id() TO beauty_support_intake;
GRANT SELECT ON beauty.users,beauty.user_roles TO beauty_support_intake;
CREATE POLICY support_identity_read ON beauty.users FOR SELECT TO beauty_support_intake USING(true);
CREATE POLICY support_role_read ON beauty.user_roles FOR SELECT TO beauty_support_intake USING(true);

CREATE FUNCTION beauty.reply_support_case(target uuid,token_hash text,content text,appeal boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ticket beauty.support_requests;
BEGIN
 SELECT * INTO ticket FROM beauty.support_requests WHERE id=target AND token_hash IS NOT NULL AND access_hash=token_hash FOR UPDATE;
 IF ticket.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF length(coalesce(trim(content),'')) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM beauty.support_request_events WHERE request_id=target AND actor_id IS NULL AND created_at>now()-interval '1 day')>=10 THEN RAISE EXCEPTION 'SUPPORT_RATE_LIMIT'; END IF;
 IF appeal AND ticket.status<>'resolved' THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.support_requests SET status=CASE WHEN appeal THEN 'appealed' ELSE 'open' END,updated_at=now() WHERE id=target;
 INSERT INTO beauty.support_request_events(request_id,status,body,public) VALUES(target,CASE WHEN appeal THEN 'appealed' ELSE 'open' END,trim(content),true);
 INSERT INTO beauty.support_email_jobs(request_id,kind) VALUES(target,CASE WHEN appeal THEN 'appeal' ELSE 'reply' END);
END $$;
CREATE FUNCTION beauty.attach_support_evidence(target uuid,token_hash text,path text,caption_text text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result uuid;
BEGIN
 PERFORM 1 FROM beauty.support_requests WHERE id=target AND token_hash IS NOT NULL AND access_hash=token_hash FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM beauty.support_evidence WHERE request_id=target)>=5 THEN RAISE EXCEPTION 'SUPPORT_EVIDENCE_LIMIT'; END IF;
 INSERT INTO beauty.support_evidence(request_id,blob_path,caption) VALUES(target,path,caption_text) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION beauty.support_evidence_path(target uuid,file_id uuid,token_hash text,staff boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result text;
BEGIN
 PERFORM beauty.support_case(target,token_hash,staff);
 SELECT blob_path INTO result FROM beauty.support_evidence WHERE id=file_id AND request_id=target;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION beauty.admin_support_requests() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_admin();
 RETURN (SELECT coalesce(jsonb_agg(r),'[]'::jsonb) FROM (
 SELECT id,name,email,topic,reference,message,status,created_at,response_due_at,first_response_at FROM beauty.support_requests
 ORDER BY (status='resolved'),created_at DESC,id DESC LIMIT 100) r);
END $$;
CREATE FUNCTION beauty.admin_support_case_action(target uuid,next_status text,content text,visible boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=beauty.require_admin();
 IF next_status IS NULL OR next_status NOT IN('open','under_review','awaiting_customer','escalated','resolved','appealed') OR length(coalesce(trim(content),'')) NOT BETWEEN 5 AND 4000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 -- Appeals and escalated decisions require Owner review, not an ordinary Admin resolution.
 IF EXISTS(SELECT 1 FROM beauty.support_requests WHERE id=target AND status IN('appealed','escalated')) AND next_status='resolved' THEN PERFORM beauty.require_owner(); END IF;
 UPDATE beauty.support_requests SET status=next_status,updated_at=now(),first_response_at=CASE WHEN visible THEN coalesce(first_response_at,now()) ELSE first_response_at END WHERE id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.support_request_events(request_id,actor_id,status,body,public) VALUES(target,actor,next_status,trim(content),visible);
 IF next_status IN('escalated','appealed') THEN INSERT INTO beauty.support_email_jobs(request_id,kind) VALUES(target,'escalation'); END IF;
END $$;
-- Preserve legacy endpoint but enforce evidence-based notes through the new action.
CREATE OR REPLACE FUNCTION beauty.admin_set_support_status(request_id uuid,next_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM beauty.admin_support_case_action(request_id,next_status,'Status updated by authorised staff',false); END $$;
CREATE FUNCTION beauty.claim_support_emails() RETURNS TABLE(id uuid,request_id uuid,kind text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH batch AS(SELECT j.id FROM beauty.support_email_jobs j WHERE j.accepted_at IS NULL AND j.available_at<=now() AND j.attempts<8 AND (j.locked_at IS NULL OR j.locked_at<now()-interval '5 minutes') ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 20)
 UPDATE beauty.support_email_jobs j SET locked_at=now(),attempts=j.attempts+1 FROM batch b WHERE j.id=b.id RETURNING j.id,j.request_id,j.kind
$$;
CREATE FUNCTION beauty.finish_support_email(target uuid,provider text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE beauty.support_email_jobs SET accepted_at=CASE WHEN provider IS NOT NULL THEN now() ELSE NULL END,provider_id=provider,locked_at=NULL,available_at=now()+interval '15 minutes' WHERE id=target AND accepted_at IS NULL
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_support_intake,beauty_admin_ops,beauty_payment_worker;
ALTER FUNCTION beauty.issue_support_access(uuid,text,text) OWNER TO beauty_support_intake;
ALTER FUNCTION beauty.support_case(uuid,text,boolean) OWNER TO beauty_support_intake;
ALTER FUNCTION beauty.reply_support_case(uuid,text,text,boolean) OWNER TO beauty_support_intake;
ALTER FUNCTION beauty.attach_support_evidence(uuid,text,text,text) OWNER TO beauty_support_intake;
ALTER FUNCTION beauty.support_evidence_path(uuid,uuid,text,boolean) OWNER TO beauty_support_intake;
ALTER FUNCTION beauty.admin_support_case_action(uuid,text,text,boolean) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.claim_support_emails() OWNER TO beauty_payment_worker;
ALTER FUNCTION beauty.finish_support_email(uuid,text) OWNER TO beauty_payment_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_support_intake,beauty_admin_ops,beauty_payment_worker;
REVOKE ALL ON FUNCTION beauty.issue_support_access(uuid,text,text),beauty.support_case(uuid,text,boolean),beauty.reply_support_case(uuid,text,text,boolean),beauty.attach_support_evidence(uuid,text,text,text),beauty.support_evidence_path(uuid,uuid,text,boolean),beauty.admin_support_case_action(uuid,text,text,boolean),beauty.claim_support_emails(),beauty.finish_support_email(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.issue_support_access(uuid,text,text),beauty.support_case(uuid,text,boolean),beauty.reply_support_case(uuid,text,text,boolean),beauty.attach_support_evidence(uuid,text,text,text),beauty.support_evidence_path(uuid,uuid,text,boolean),beauty.admin_support_case_action(uuid,text,text,boolean) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.claim_support_emails(),beauty.finish_support_email(uuid,text) TO beauty_payment_worker;

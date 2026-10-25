-- Operational review only. No financial records, evidence or accounts are deleted.
ALTER TABLE beauty.support_requests DROP CONSTRAINT support_requests_topic_check;
ALTER TABLE beauty.support_requests ADD CONSTRAINT support_requests_topic_check CHECK(topic IN ('Account & sign-in','Booking','Shop order','Professional account','Other','Privacy & data request','Privacy complaint','Complaint / appeal'));
ALTER TABLE beauty.support_requests
 ADD COLUMN case_kind text NOT NULL DEFAULT 'general' CHECK(case_kind IN('general','privacy_request','access','correction','erasure','restriction','objection','portability','privacy_complaint','complaint')),
 ADD COLUMN identity_review text NOT NULL DEFAULT 'unreviewed' CHECK(identity_review IN('unreviewed','pending','verified','not_needed')),
 ADD COLUMN retention_hold_reason text CHECK(length(retention_hold_reason) BETWEEN 5 AND 500),
 ADD COLUMN next_review_at date,
 ADD COLUMN received_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN closed_at timestamptz;
UPDATE beauty.support_requests SET closed_at=updated_at WHERE status='resolved';
UPDATE beauty.support_requests SET received_at=created_at;
GRANT UPDATE(case_kind,identity_review,retention_hold_reason,next_review_at,received_at) ON beauty.support_requests TO beauty_admin_ops;

CREATE FUNCTION beauty.support_ops_dates() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.case_kind:=CASE NEW.topic WHEN 'Privacy & data request' THEN 'privacy_request' WHEN 'Privacy complaint' THEN 'privacy_complaint' WHEN 'Complaint / appeal' THEN 'complaint' ELSE 'general' END;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status='resolved' THEN NEW.closed_at:=now();
  ELSE NEW.closed_at:=NULL; NEW.next_review_at:=NULL; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER support_operations_dates BEFORE INSERT OR UPDATE OF status ON beauty.support_requests FOR EACH ROW EXECUTE FUNCTION beauty.support_ops_dates();

CREATE FUNCTION beauty.support_rights_target(received timestamptz,kind text) RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN kind IN('privacy_request','access','correction','erasure','restriction','objection','portability') THEN (((received AT TIME ZONE 'Europe/London')::date + interval '1 month' + interval '1 day') AT TIME ZONE 'Europe/London')-interval '1 microsecond'
 WHEN kind='privacy_complaint' THEN received+interval '30 days' ELSE NULL END
$$;
CREATE INDEX support_operations_review ON beauty.support_requests(next_review_at,closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX support_operations_rights ON beauty.support_requests(received_at) WHERE status<>'resolved' AND case_kind<>'general';

-- Owner-only operational metadata; guest ticket links never grant identity/hold review access.
CREATE FUNCTION beauty.owner_support_operations(target uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM beauty.require_owner();
 IF target IS NOT NULL THEN
  SELECT jsonb_build_object('id',id,'kind',case_kind,'identity',identity_review,'holdReason',coalesce(retention_hold_reason,''),'nextReviewAt',next_review_at,'closedAt',closed_at,'receivedOn',to_char(received_at AT TIME ZONE 'Europe/London','YYYY-MM-DD'),
    'rightsDueAt',beauty.support_rights_target(received_at,case_kind),'evidenceReviewAt',closed_at+interval '90 days','caseReviewAt',closed_at+interval '2 years') INTO result FROM beauty.support_requests WHERE id=target;
  IF result IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
  RETURN result;
 END IF;
 RETURN jsonb_build_object('rightsPending',(SELECT count(*) FROM beauty.support_requests WHERE status<>'resolved' AND case_kind IN('privacy_request','access','correction','erasure','restriction','objection','portability')),
 'items',(SELECT coalesce(jsonb_agg(q),'[]'::jsonb) FROM (
  SELECT id,topic,status,case_kind AS kind,beauty.support_rights_target(received_at,case_kind) AS "rightsDueAt",retention_hold_reason IS NOT NULL AS "onHold",
   coalesce(next_review_at::timestamptz,CASE WHEN closed_at IS NOT NULL THEN closed_at+interval '90 days' END) AS "reviewAt"
  FROM beauty.support_requests
  WHERE (status<>'resolved' AND case_kind<>'general') OR next_review_at<=current_date OR (closed_at IS NOT NULL AND coalesce(next_review_at::timestamptz,closed_at+interval '90 days')<=now())
  ORDER BY coalesce(beauty.support_rights_target(received_at,case_kind),next_review_at::timestamptz,closed_at+interval '90 days'),id LIMIT 50
 ) q));
END $$;
CREATE FUNCTION beauty.owner_update_support_operations(target uuid,payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; prior jsonb; following jsonb; kind text:=payload->>'kind'; identity_state text:=payload->>'identity'; reason text:=trim(payload->>'reason'); hold_text text:=nullif(trim(payload->>'holdReason'),''); review_date date:=nullif(payload->>'nextReviewAt','')::date; received_date date:=(payload->>'receivedOn')::date;
BEGIN
 actor:=beauty.require_owner();
 IF kind IS NULL OR kind NOT IN('general','privacy_request','access','correction','erasure','restriction','objection','portability','privacy_complaint','complaint')
 OR identity_state IS NULL OR identity_state NOT IN('unreviewed','pending','verified','not_needed') OR length(coalesce(reason,'')) NOT BETWEEN 10 AND 500
 OR received_date IS NULL OR received_date<current_date-3660
 OR (hold_text IS NOT NULL AND length(hold_text) NOT BETWEEN 5 AND 500)
 OR (review_date IS NOT NULL AND (review_date<current_date OR review_date>current_date+366)) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('kind',case_kind,'identity',identity_review,'holdReason',retention_hold_reason,'nextReviewAt',next_review_at,'receivedAt',received_at) INTO prior FROM beauty.support_requests WHERE id=target FOR UPDATE;
 IF prior IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF received_date>(SELECT (created_at AT TIME ZONE 'Europe/London')::date FROM beauty.support_requests WHERE id=target) THEN RAISE EXCEPTION 'INVALID_RECEIVED_DATE' USING ERRCODE='22023'; END IF;
 IF hold_text IS NOT NULL AND review_date IS NULL THEN RAISE EXCEPTION 'HOLD_REVIEW_REQUIRED' USING ERRCODE='22023'; END IF;
 UPDATE beauty.support_requests SET case_kind=kind,identity_review=identity_state,retention_hold_reason=hold_text,next_review_at=review_date,received_at=received_date::timestamp AT TIME ZONE 'Europe/London',updated_at=now() WHERE id=target;
 following:=jsonb_build_object('kind',kind,'identity',identity_state,'holdReason',hold_text,'nextReviewAt',review_date,'receivedOn',received_date);
 INSERT INTO beauty.support_request_events(request_id,actor_id,status,body,public) SELECT id,actor,status,'Privacy/retention review: '||reason,false FROM beauty.support_requests WHERE id=target;
 INSERT INTO beauty.financial_admin_audit_logs(actor_user_id,action,target_type,target_id,reason,previous_state,new_state) VALUES(actor,'support.operations_review','support_request',target,reason,prior||jsonb_build_object('id',target),following||jsonb_build_object('id',target));
END $$;
CREATE OR REPLACE FUNCTION beauty.admin_support_case_action(target uuid,next_status text,content text,visible boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; ticket beauty.support_requests;
BEGIN
 actor:=beauty.require_admin();
 IF next_status IS NULL OR next_status NOT IN('open','under_review','awaiting_customer','escalated','resolved','appealed') OR length(coalesce(trim(content),'')) NOT BETWEEN 5 AND 4000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT * INTO ticket FROM beauty.support_requests WHERE id=target FOR UPDATE;
 IF ticket.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF next_status='resolved' AND (ticket.status IN('appealed','escalated') OR ticket.case_kind NOT IN('general','complaint')) THEN PERFORM beauty.require_owner(); END IF;
 IF next_status='resolved' AND ticket.case_kind NOT IN('general','complaint') THEN
  IF visible IS DISTINCT FROM true THEN RAISE EXCEPTION 'PUBLIC_OUTCOME_REQUIRED' USING ERRCODE='22023'; END IF;
  IF ticket.case_kind<>'privacy_complaint' AND ticket.identity_review NOT IN('verified','not_needed') THEN RAISE EXCEPTION 'IDENTITY_REVIEW_REQUIRED' USING ERRCODE='22023'; END IF;
 END IF;
 UPDATE beauty.support_requests SET status=next_status,updated_at=now(),first_response_at=CASE WHEN visible THEN coalesce(first_response_at,now()) ELSE first_response_at END WHERE id=target;
 INSERT INTO beauty.support_request_events(request_id,actor_id,status,body,public) VALUES(target,actor,next_status,trim(content),visible);
 IF next_status IN('escalated','appealed') THEN INSERT INTO beauty.support_email_jobs(request_id,kind) VALUES(target,'escalation'); END IF;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_support_operations(uuid) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_update_support_operations(uuid,jsonb) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.support_ops_dates(),beauty.support_rights_target(timestamptz,text),beauty.owner_support_operations(uuid),beauty.owner_update_support_operations(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.support_rights_target(timestamptz,text) TO beauty_admin_ops;
GRANT EXECUTE ON FUNCTION beauty.owner_support_operations(uuid),beauty.owner_update_support_operations(uuid,jsonb) TO beauty_app;

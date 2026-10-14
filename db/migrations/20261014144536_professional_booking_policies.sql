-- Additive, staged policy system. No production migration or Stripe operation is run by source changes.
CREATE TABLE beauty.professional_policy_scopes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 service_id uuid, draft jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 published_version_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(service_id,professional_id) REFERENCES beauty.services(id,professional_id)
);
CREATE UNIQUE INDEX policy_general_scope ON beauty.professional_policy_scopes(professional_id) WHERE service_id IS NULL;
CREATE UNIQUE INDEX policy_service_scope ON beauty.professional_policy_scopes(service_id) WHERE service_id IS NOT NULL;
CREATE TABLE beauty.professional_policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scope_id uuid NOT NULL REFERENCES beauty.professional_policy_scopes(id),
 version integer NOT NULL CHECK(version>0),requested_revision integer NOT NULL,content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),
 created_by uuid NOT NULL REFERENCES beauty.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(scope_id,version)
);
ALTER TABLE beauty.professional_policy_scopes ADD FOREIGN KEY(published_version_id) REFERENCES beauty.professional_policy_versions(id);
CREATE TABLE beauty.professional_policy_reviews (
 version_id uuid PRIMARY KEY REFERENCES beauty.professional_policy_versions(id),status text NOT NULL CHECK(status IN('pending','approved','rejected','flagged')),
 reason text,reviewed_by uuid REFERENCES beauty.users(id),reviewed_at timestamptz,published_at timestamptz
);
CREATE TABLE beauty.booking_policy_terms (
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),customer_id uuid NOT NULL REFERENCES beauty.users(id),service_id uuid NOT NULL,
 general_version_id uuid REFERENCES beauty.professional_policy_versions(id),service_version_id uuid REFERENCES beauty.professional_policy_versions(id),
 snapshot jsonb NOT NULL,acknowledged_at timestamptz,acknowledgement_source text NOT NULL CHECK(acknowledgement_source IN('affirmative','legacy_unrecorded')),
 early_service_requested boolean NOT NULL DEFAULT false,original_starts_at timestamptz NOT NULL,price_pence integer NOT NULL,deposit_pence integer NOT NULL,
 pricing_version text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK((acknowledgement_source='affirmative')=(acknowledged_at IS NOT NULL))
);
CREATE TABLE beauty.booking_policy_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES beauty.bookings(id),actor_id uuid NOT NULL REFERENCES beauty.users(id),
 kind text NOT NULL CHECK(kind IN('reschedule_requested','rescheduled','reschedule_rejected','late','shorten_accepted','shorten_rejected','requirements','requirements_ready','retention_requested','retention_reviewed','no_show_review')),
 details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX policy_events_booking ON beauty.booking_policy_events(booking_id,created_at,id);
CREATE TABLE beauty.booking_preparation (
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id),preparation_info text NOT NULL DEFAULT '' CHECK(length(preparation_info)<=1500),
 health_info text CHECK(length(health_info)<=1000),health_consent_at timestamptz,consultation_done boolean NOT NULL DEFAULT false,patch_test_done boolean NOT NULL DEFAULT false,
 professional_ready_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),CHECK(health_info IS NULL OR health_consent_at IS NOT NULL)
);
CREATE TABLE beauty.booking_reference_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES beauty.bookings(id),image bytea NOT NULL CHECK(octet_length(image)<=500000),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reference_photos_booking ON beauty.booking_reference_photos(booking_id);
CREATE TABLE beauty.booking_retention_reviews (
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id),requested_by uuid NOT NULL REFERENCES beauty.users(id),loss_pence integer NOT NULL CHECK(loss_pence>0),
 evidence text NOT NULL CHECK(length(evidence) BETWEEN 20 AND 2000),mitigation text NOT NULL CHECK(length(mitigation) BETWEEN 20 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),reviewed_by uuid REFERENCES beauty.users(id),review_reason text,reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.professional_policy_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES beauty.users(id),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 action text NOT NULL,version_id uuid REFERENCES beauty.professional_policy_versions(id),previous_state jsonb,new_state jsonb,reason text,created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['professional_policy_scopes','professional_policy_versions','professional_policy_reviews','booking_policy_terms','booking_policy_events','booking_preparation','booking_reference_photos','booking_retention_reviews','professional_policy_audit'] LOOP
  EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
  EXECUTE format('GRANT SELECT,INSERT ON beauty.%I TO beauty_booking_ops',t);
  EXECUTE format('CREATE POLICY %I ON beauty.%I FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true)',t||'_ops',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['professional_policy_scopes','professional_policy_reviews','booking_retention_reviews','booking_preparation'] LOOP
  EXECUTE format('GRANT UPDATE ON beauty.%I TO beauty_booking_ops',t);
 END LOOP;
 GRANT DELETE ON beauty.booking_reference_photos TO beauty_booking_ops;
 FOREACH t IN ARRAY ARRAY['professional_policy_scopes','professional_policy_versions','professional_policy_reviews','booking_policy_terms','booking_policy_events','booking_retention_reviews','professional_policy_audit'] LOOP
  EXECUTE format('GRANT SELECT ON beauty.%I TO beauty_admin_ops',t);
  EXECUTE format('CREATE POLICY %I ON beauty.%I FOR SELECT TO beauty_admin_ops USING(true)',t||'_admin',t);
 END LOOP;
 GRANT SELECT,UPDATE ON beauty.professional_policy_reviews,beauty.professional_policy_scopes,beauty.booking_retention_reviews TO beauty_admin_ops;
 GRANT INSERT ON beauty.professional_policy_audit TO beauty_admin_ops;
 FOREACH t IN ARRAY ARRAY['professional_policy_reviews','professional_policy_scopes','booking_retention_reviews'] LOOP
  EXECUTE format('CREATE POLICY %I ON beauty.%I FOR UPDATE TO beauty_admin_ops USING(true) WITH CHECK(true)',t||'_admin_update',t);
 END LOOP;
 CREATE POLICY policy_admin_audit_insert ON beauty.professional_policy_audit FOR INSERT TO beauty_admin_ops WITH CHECK(true);
 GRANT SELECT ON beauty.professional_policy_scopes,beauty.professional_policy_versions,beauty.professional_policy_reviews TO beauty_catalog;
 FOREACH t IN ARRAY ARRAY['professional_policy_scopes','professional_policy_versions','professional_policy_reviews'] LOOP
  EXECUTE format('CREATE POLICY %I ON beauty.%I FOR SELECT TO beauty_catalog USING(true)',t||'_catalog',t);
 END LOOP;
END $$;
-- Admin review needs service names, without access to service mutation or private preparation.
GRANT SELECT(id,name) ON beauty.services TO beauty_admin_ops;
CREATE POLICY policy_admin_service_names ON beauty.services FOR SELECT TO beauty_admin_ops USING(true);

CREATE FUNCTION beauty.default_booking_policy() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT '{"graceMinutes":10,"lateInstructions":"","cancellationHours":24,"depositPercent":null,"rescheduleHours":24,"maxReschedules":1,"freeReschedule":true,"guests":"approval","children":"approval","preparation":[],"preparationText":"","requireReferences":false,"requireConsultation":false,"requirePatchTest":false,"restrictions":"","customRules":""}'::jsonb
$$;
CREATE FUNCTION beauty.policy_cooling_off_end(accepted_at timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT (((accepted_at AT TIME ZONE 'Europe/London')::date+15)::timestamp AT TIME ZONE 'Europe/London')
$$;
CREATE FUNCTION beauty.validate_professional_policy(payload jsonb,service_specific boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE k text; v jsonb; BEGIN
 IF jsonb_typeof(payload)<>'object' OR payload IS NULL OR (SELECT count(*) FROM jsonb_object_keys(payload))<>16 THEN RETURN false; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(payload) LOOP
  IF NOT (beauty.default_booking_policy() ? k) THEN RETURN false; END IF;
  IF k IN('lateInstructions','preparationText','restrictions','customRules') THEN
   IF jsonb_typeof(v)<>'string' OR length(v#>>'{}')>(CASE k WHEN 'lateInstructions' THEN 1000 WHEN 'customRules' THEN 3000 ELSE 1500 END) THEN RETURN false; END IF;
  ELSIF k='preparation' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>6 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE x NOT IN('"clean_hair"','"remove_makeup"','"bring_products"','"consultation"','"patch_test"','"reference_photos"')) THEN RETURN false; END IF;
  ELSIF v='null'::jsonb THEN
   IF NOT service_specific AND k<>'depositPercent' THEN RETURN false; END IF;
  ELSIF k IN('freeReschedule','requireReferences','requireConsultation','requirePatchTest') THEN
   IF jsonb_typeof(v)<>'boolean' THEN RETURN false; END IF;
  ELSIF k IN('guests','children') THEN
   IF v NOT IN('"allowed"','"none"','"approval"') THEN RETURN false; END IF;
  ELSIF k='graceMinutes' THEN
   IF v NOT IN('0','5','10','15','20','30') THEN RETURN false; END IF;
  ELSIF k IN('cancellationHours','rescheduleHours') THEN
   IF v NOT IN('6','12','24','48','72') THEN RETURN false; END IF;
  ELSIF k='depositPercent' THEN
   IF jsonb_typeof(v)<>'number' OR (v#>>'{}')::numeric NOT BETWEEN 15 AND 40 OR trunc((v#>>'{}')::numeric)<>(v#>>'{}')::numeric THEN RETURN false; END IF;
  ELSIF k='maxReschedules' THEN
   IF v NOT IN('0','1','2','3','4','5') THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION beauty.policy_actor_professional() RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE target uuid; BEGIN
 SELECT p.id INTO target FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional' WHERE u.auth_id=beauty.auth_id() AND u.status='active';
 IF target IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; RETURN target;
END $$;
CREATE FUNCTION beauty.save_my_professional_policy(target_service uuid,operation text,expected_revision integer,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; actor uuid; scope beauty.professional_policy_scopes; ver beauty.professional_policy_versions; needs_review boolean; previous jsonb; BEGIN
 target:=beauty.policy_actor_professional(); SELECT user_id INTO actor FROM beauty.professional_profiles WHERE id=target;
 PERFORM pg_advisory_xact_lock(hashtextextended('policies:'||target::text,0));
 IF operation NOT IN('save','publish','unpublish') OR expected_revision IS NULL OR NOT beauty.validate_professional_policy(payload,target_service IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_POLICY' USING ERRCODE='22023'; END IF;
 IF target_service IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.services WHERE id=target_service AND professional_id=target) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO scope FROM beauty.professional_policy_scopes WHERE professional_id=target AND service_id IS NOT DISTINCT FROM target_service FOR UPDATE;
 IF coalesce(scope.revision,0)<>expected_revision THEN RAISE EXCEPTION 'POLICY_EDIT_CONFLICT' USING ERRCODE='40001'; END IF;
 IF scope.id IS NULL THEN INSERT INTO beauty.professional_policy_scopes(professional_id,service_id,draft) VALUES(target,target_service,payload) RETURNING * INTO scope; END IF;
 previous:=to_jsonb(scope);
 UPDATE beauty.professional_policy_scopes SET draft=payload,revision=revision+1,updated_at=now() WHERE id=scope.id;
 IF operation='publish' THEN
  needs_review:=length(trim(payload->>'lateInstructions')||trim(payload->>'preparationText')||trim(payload->>'restrictions')||trim(payload->>'customRules'))>0;
  INSERT INTO beauty.professional_policy_versions(scope_id,version,requested_revision,content,created_by) VALUES(scope.id,(SELECT coalesce(max(version),0)+1 FROM beauty.professional_policy_versions WHERE scope_id=scope.id),scope.revision+1,payload,actor) RETURNING * INTO ver;
  INSERT INTO beauty.professional_policy_reviews(version_id,status,published_at) VALUES(ver.id,CASE WHEN needs_review THEN 'pending' ELSE 'approved' END,CASE WHEN needs_review THEN NULL ELSE now() END);
  IF NOT needs_review THEN UPDATE beauty.professional_policy_scopes SET published_version_id=ver.id WHERE id=scope.id; END IF;
 ELSIF operation='unpublish' THEN UPDATE beauty.professional_policy_scopes SET published_version_id=NULL WHERE id=scope.id; END IF;
 INSERT INTO beauty.professional_policy_audit(actor_id,professional_id,action,version_id,previous_state,new_state) SELECT actor,target,operation,ver.id,previous,to_jsonb(s) FROM beauty.professional_policy_scopes s WHERE id=scope.id;
 RETURN jsonb_build_object('saved',true,'reviewRequired',coalesce(needs_review,false),'versionId',ver.id);
END $$;
CREATE FUNCTION beauty.my_policy_workspace() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; BEGIN
 target:=beauty.policy_actor_professional();
 RETURN jsonb_build_object('scopes',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM beauty.professional_policy_scopes s WHERE professional_id=target),'[]'),
 'versions',coalesce((SELECT jsonb_agg(to_jsonb(v)||jsonb_build_object('review_status',r.status,'review_reason',r.reason,'published_at',r.published_at) ORDER BY v.created_at DESC) FROM beauty.professional_policy_versions v JOIN beauty.professional_policy_scopes s ON s.id=v.scope_id JOIN beauty.professional_policy_reviews r ON r.version_id=v.id WHERE s.professional_id=target),'[]'),
 'services',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM beauty.services WHERE professional_id=target),'[]'));
END $$;
CREATE FUNCTION beauty.public_service_policy(target_service uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s beauty.services; g jsonb:=beauty.default_booking_policy(); extra jsonb:='{}'; general_id uuid; service_id uuid; rules jsonb; verified boolean; dep integer; published timestamptz; service_published timestamptz; result jsonb; BEGIN
 SELECT s0.* INTO s FROM beauty.services s0 JOIN beauty.professional_profiles p ON p.id=s0.professional_id JOIN beauty.users u ON u.id=p.user_id WHERE s0.id=target_service AND s0.active AND p.publication_status='published' AND u.status='active';
 IF s.id IS NULL THEN RAISE EXCEPTION 'UNAVAILABLE_SERVICE' USING ERRCODE='22023'; END IF;
 SELECT v.content,v.id,r.published_at INTO rules,general_id,published FROM beauty.professional_policy_scopes sc JOIN beauty.professional_policy_versions v ON v.id=sc.published_version_id JOIN beauty.professional_policy_reviews r ON r.version_id=v.id AND r.status='approved' WHERE sc.professional_id=s.professional_id AND sc.service_id IS NULL;
 g:=g||coalesce(jsonb_strip_nulls(rules),'{}');
 SELECT v.content,v.id,r.published_at INTO rules,service_id,service_published FROM beauty.professional_policy_scopes sc JOIN beauty.professional_policy_versions v ON v.id=sc.published_version_id JOIN beauty.professional_policy_reviews r ON r.version_id=v.id AND r.status='approved' WHERE sc.service_id=s.id;
 published:=greatest(published,service_published); extra:=coalesce(jsonb_strip_nulls(rules),'{}'); rules:=g||extra;
 -- Requirements and preparation supplement general requirements; a treatment cannot silently remove a general safety requirement.
 rules:=rules||jsonb_build_object('preparation',(SELECT coalesce(jsonb_agg(value ORDER BY first_index),'[]') FROM(SELECT value,min(n) AS first_index FROM jsonb_array_elements_text((g->'preparation')||coalesce(extra->'preparation','[]')) WITH ORDINALITY AS p(value,n) GROUP BY value) merged),
 'lateInstructions',coalesce(nullif(extra->>'lateInstructions',''),g->>'lateInstructions'),
 'preparationText',concat_ws(E'\n',nullif(g->>'preparationText',''),nullif(extra->>'preparationText','')),
 'requireReferences',coalesce((g->>'requireReferences')::boolean,false) OR coalesce((extra->>'requireReferences')::boolean,false),
 'requireConsultation',coalesce((g->>'requireConsultation')::boolean,false) OR coalesce((extra->>'requireConsultation')::boolean,false),
 'requirePatchTest',coalesce((g->>'requirePatchTest')::boolean,false) OR coalesce((extra->>'requirePatchTest')::boolean,false),
 'restrictions',concat_ws(E'\n',nullif(g->>'restrictions',''),nullif(extra->>'restrictions','')));
 verified:=coalesce((beauty.professional_access_state(s.professional_id)->>'verified')::boolean,false);
 dep:=CASE WHEN NOT verified THEN s.price_pence WHEN (rules->>'depositPercent') IS NOT NULL THEN greatest(ceil(s.price_pence*0.15)::int,least(floor(s.price_pence*0.4)::int,round(s.price_pence*(rules->>'depositPercent')::numeric/100)::int)) ELSE s.deposit_pence END;
 result:=jsonb_build_object('professionalId',s.professional_id,'serviceId',s.id,'serviceName',s.name,'generalVersionId',general_id,'serviceVersionId',service_id,'rules',rules,'generalCustomRules',g->>'customRules','serviceCustomRules',coalesce(extra->>'customRules',''),'timezone','Europe/London','pricePence',s.price_pence,'depositPence',dep,'bookingFeePence',beauty.public_booking_fee_pence(),'fullPrepayment',NOT verified,'publishedAt',published);
 RETURN result||jsonb_build_object('token',md5(result::text));
END $$;

-- Original reservation, availability, anti-abuse, Connect and trial safeguards remain the authoritative path.
ALTER FUNCTION beauty.reserve_booking(uuid,timestamptz) RENAME TO reserve_booking_before_policies;
REVOKE ALL ON FUNCTION beauty.reserve_booking_before_policies(uuid,timestamptz) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.policy_booking_deposit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE snapshot jsonb:=nullif(current_setting('app.policy_acceptance',true),'')::jsonb; BEGIN
 IF snapshot IS NOT NULL THEN
  NEW.deposit_pence:=(snapshot->>'depositPence')::integer;
  NEW.cancellation_policy_version:='professional-policy-v1';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER aaa_policy_booking_deposit BEFORE INSERT ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.policy_booking_deposit();
CREATE FUNCTION beauty.reserve_booking(target_service uuid,target_start timestamptz,accepted_token text,early_service boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE snapshot jsonb; result jsonb; b beauty.bookings; terms beauty.booking_policy_terms; pro uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer' WHERE u.auth_id=beauty.auth_id() AND u.status='active') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT professional_id INTO pro FROM beauty.services WHERE id=target_service;
 PERFORM pg_advisory_xact_lock(hashtextextended('policies:'||pro::text,0));
 snapshot:=beauty.public_service_policy(target_service);
 IF accepted_token IS NULL OR accepted_token IS DISTINCT FROM snapshot->>'token' THEN RAISE EXCEPTION 'POLICY_CHANGED' USING ERRCODE='22023'; END IF;
 IF early_service IS NULL OR (target_start<beauty.policy_cooling_off_end(now()) AND NOT early_service) THEN RAISE EXCEPTION 'EARLY_SERVICE_REQUEST_REQUIRED' USING ERRCODE='22023'; END IF;
 PERFORM set_config('app.policy_acceptance',snapshot::text,true);
 result:=beauty.reserve_booking_before_policies(target_service,target_start);
 PERFORM set_config('app.policy_acceptance','',true);
 SELECT * INTO b FROM beauty.bookings WHERE id=(result->>'id')::uuid;
 -- Prices and fees may change independently of professional policy publication.
 -- Reject and roll back if the authoritative reservation differs from the terms reviewed.
 IF b.price_pence IS DISTINCT FROM (snapshot->>'pricePence')::integer
  OR b.deposit_pence IS DISTINCT FROM (snapshot->>'depositPence')::integer
  OR (SELECT customer_fee_pence FROM beauty.booking_commission_terms WHERE booking_id=b.id)
     IS DISTINCT FROM (snapshot->>'bookingFeePence')::integer THEN
  RAISE EXCEPTION 'POLICY_CHANGED' USING ERRCODE='22023';
 END IF;
 SELECT * INTO terms FROM beauty.booking_policy_terms WHERE booking_id=b.id;
 IF terms.booking_id IS NOT NULL THEN
  IF terms.snapshot->>'token' IS DISTINCT FROM accepted_token THEN RAISE EXCEPTION 'POLICY_CHANGED' USING ERRCODE='22023'; END IF;
 ELSE
  INSERT INTO beauty.booking_policy_terms(booking_id,professional_id,customer_id,service_id,general_version_id,service_version_id,snapshot,acknowledged_at,acknowledgement_source,early_service_requested,original_starts_at,price_pence,deposit_pence,pricing_version)
  VALUES(b.id,b.professional_id,b.customer_id,b.service_id,(snapshot->>'generalVersionId')::uuid,(snapshot->>'serviceVersionId')::uuid,snapshot,now(),'affirmative',early_service,b.starts_at,b.price_pence,b.deposit_pence,(SELECT pricing_version FROM beauty.booking_commission_terms WHERE booking_id=b.id));
 END IF;
 RETURN result;
END $$;
-- Keep a rejecting signature for obsolete/internal callers: affirmative version acknowledgement is mandatory.
CREATE FUNCTION beauty.reserve_booking(target_service uuid,target_start timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'POLICY_ACKNOWLEDGEMENT_REQUIRED' USING ERRCODE='22023'; END $$;
INSERT INTO beauty.booking_policy_terms(booking_id,professional_id,customer_id,service_id,snapshot,acknowledgement_source,original_starts_at,price_pence,deposit_pence,pricing_version)
SELECT b.id,b.professional_id,b.customer_id,b.service_id,jsonb_build_object('token','legacy:'||b.cancellation_policy_version,'generalVersionId',NULL,'serviceVersionId',NULL,'rules',beauty.default_booking_policy()||'{"maxReschedules":0}'::jsonb,'generalCustomRules','','serviceCustomRules','','timezone','Europe/London','pricePence',b.price_pence,'depositPence',b.deposit_pence,'bookingFeePence',coalesce(c.customer_fee_pence,100),'fullPrepayment',b.deposit_pence=b.price_pence,'publishedAt',NULL),'legacy_unrecorded',b.starts_at,b.price_pence,b.deposit_pence,coalesce(c.pricing_version,'legacy-unrecorded') FROM beauty.bookings b LEFT JOIN beauty.booking_commission_terms c ON c.booking_id=b.id;

CREATE FUNCTION beauty.policy_booking_actor(target uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b beauty.bookings; actor uuid; is_pro boolean; BEGIN
 SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';
 SELECT * INTO b FROM beauty.bookings WHERE id=target;
 is_pro:=EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=b.professional_id AND user_id=actor);
 IF actor IS NULL OR b.id IS NULL OR (actor<>b.customer_id AND NOT is_pro) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('actor',actor,'professional',is_pro);
END $$;
CREATE FUNCTION beauty.policy_refund_assessment(target uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b beauty.bookings; p beauty.payments; t beauty.booking_policy_terms; notice integer:=24; timely boolean; cooling boolean; mandatory boolean; loss integer:=0; BEGIN
 SELECT * INTO b FROM beauty.bookings WHERE id=target; SELECT * INTO p FROM beauty.payments WHERE booking_id=target; SELECT * INTO t FROM beauty.booking_policy_terms WHERE booking_id=target;
 IF t.booking_id IS NOT NULL THEN notice:=coalesce((t.snapshot->'rules'->>'cancellationHours')::int,24); END IF;
 timely:=b.starts_at-coalesce(b.cancelled_at,now())>=notice*interval '1 hour';
 -- New unperformed online services retain cooling-off protection. No automatic waiver or inference of actual work from a checkbox.
 cooling:=t.acknowledgement_source='affirmative' AND coalesce(b.cancelled_at,now())<beauty.policy_cooling_off_end(t.acknowledged_at) AND b.completed_at IS NULL;
 mandatory:=b.cancellation_actor='professional' OR timely OR cooling OR b.status='expired' OR (b.status='payment_pending' AND b.hold_expires_at<=now()) OR (b.cancelled_at IS NOT NULL AND p.updated_at>b.cancelled_at);
 SELECT least(r.loss_pence,b.deposit_pence) INTO loss FROM beauty.booking_retention_reviews r WHERE r.booking_id=target AND r.status='approved'; loss:=coalesce(loss,0);
 RETURN jsonb_build_object('mandatoryFullRefund',coalesce(mandatory,false),'noticeHours',notice,'timely',timely,'coolingOff',coalesce(cooling,false),'remainingPaidPence',greatest(0,p.captured_pence-p.refunded_pence),
 'minimumRefundPence',greatest(0,p.captured_pence-p.refunded_pence-CASE WHEN mandatory THEN 0 ELSE loss END),'reviewRequired',NOT coalesce(mandatory,false) AND loss=0);
END $$;
CREATE FUNCTION beauty.booking_policy_overview(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.policy_booking_actor(target);
 RETURN jsonb_build_object('terms',(SELECT jsonb_build_object('snapshot',snapshot,'acknowledged_at',acknowledged_at,'acknowledgement_source',acknowledgement_source,'original_starts_at',original_starts_at,'price_pence',price_pence,'deposit_pence',deposit_pence) FROM beauty.booking_policy_terms WHERE booking_id=target),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at,id) FROM beauty.booking_policy_events e WHERE booking_id=target),'[]'),
 'assessment',beauty.policy_refund_assessment(target),'requirements',(SELECT to_jsonb(p) FROM beauty.booking_preparation p WHERE booking_id=target),
 'photos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'created_at',created_at)) FROM beauty.booking_reference_photos WHERE booking_id=target),'[]'),
 'retention',(SELECT to_jsonb(r)-'requested_by'-'reviewed_by' FROM beauty.booking_retention_reviews r WHERE booking_id=target));
END $$;

-- Extend the existing retryable notification outbox; no second email/payment pipeline.
ALTER TABLE beauty.notification_outbox ADD COLUMN event_reference text NOT NULL DEFAULT 'original';
ALTER TABLE beauty.notification_outbox DROP CONSTRAINT notification_outbox_booking_id_kind_recipient_user_id_key;
ALTER TABLE beauty.notification_outbox ADD UNIQUE(booking_id,kind,recipient_user_id,event_reference);
ALTER TABLE beauty.notification_outbox DROP CONSTRAINT notification_outbox_kind_check;
ALTER TABLE beauty.notification_outbox ADD CHECK(kind IN('confirmation','cancellation','reminder','review_request','rescheduled','late_notice','requirements_update'));
ALTER TABLE beauty.in_app_notifications DROP CONSTRAINT in_app_notifications_kind_check;
ALTER TABLE beauty.in_app_notifications ADD CHECK(kind IN('booking_created','booking_confirmed','booking_cancelled','appointment_completed','booking_reminder','order_paid','order_processing','order_shipped','order_delivered','order_refund_pending','order_refunded','order_shipping_reminder','commission_changed','booking_policy_update','professional_policy_review'));
GRANT INSERT ON beauty.in_app_notifications TO beauty_booking_ops;
CREATE POLICY policy_inbox_ops ON beauty.in_app_notifications FOR INSERT TO beauty_booking_ops WITH CHECK(true);
CREATE FUNCTION beauty.notify_policy_booking(target uuid,event uuid,notice_kind text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b beauty.bookings; pro_user uuid; recipient uuid; BEGIN
 SELECT * INTO b FROM beauty.bookings WHERE id=target; SELECT user_id INTO pro_user FROM beauty.professional_profiles WHERE id=b.professional_id;
 FOREACH recipient IN ARRAY ARRAY[b.customer_id,pro_user] LOOP
  INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id,event_reference) VALUES(target,notice_kind,recipient,event::text) ON CONFLICT DO NOTHING;
  INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href) VALUES(recipient,'booking_policy_update','Your appointment has an update','Open your appointment to review its timing, preparation or arrival update. No charge was created by this update.','/account/bookings/'||target::text);
 END LOOP;
END $$;
-- Extend the existing claimed/retried email queue so policy events are actually deliverable.
CREATE OR REPLACE FUNCTION beauty.claim_notifications()
RETURNS TABLE(id uuid,booking_id uuid,kind text,email text,service_name text,professional_name text,starts_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 RETURN QUERY WITH eligible AS(
  SELECT n.id FROM beauty.notification_outbox n JOIN beauty.bookings b ON b.id=n.booking_id JOIN beauty.users u ON u.id=n.recipient_user_id
  WHERE n.sent_at IS NULL AND n.due_at<=now() AND(n.claimed_until IS NULL OR n.claimed_until<now())
  AND n.attempts<5 AND(n.first_attempt_at IS NULL OR n.first_attempt_at>now()-interval '23 hours')
  AND NOT EXISTS(SELECT 1 FROM beauty.email_suppressions suppression WHERE suppression.email=lower(u.email))
  AND ((n.kind='confirmation' AND b.status IN('confirmed','completed'))
    OR(n.kind='cancellation' AND b.status='cancelled')
    OR(n.kind='reminder' AND b.status='confirmed' AND b.starts_at>now())
    OR(n.kind='review_request' AND b.status='completed')
    OR(n.kind IN('rescheduled','late_notice','requirements_update') AND b.status IN('payment_pending','confirmed','completed','cancelled','no_show')))
  ORDER BY n.due_at LIMIT 20 FOR UPDATE OF n SKIP LOCKED
 ),claimed AS(
  UPDATE beauty.notification_outbox n SET claimed_until=now()+interval '5 minutes',attempts=n.attempts+1,first_attempt_at=coalesce(n.first_attempt_at,now())
  FROM eligible WHERE n.id=eligible.id RETURNING n.*
 ) SELECT n.id,n.booking_id,n.kind,u.email,b.service_name,b.professional_name,b.starts_at
 FROM claimed n JOIN beauty.users u ON u.id=n.recipient_user_id JOIN beauty.bookings b ON b.id=n.booking_id;
END $$;
CREATE FUNCTION beauty.notification_booking_policy(target uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT snapshot||jsonb_build_object('acknowledgedAt',acknowledged_at)
 FROM beauty.booking_policy_terms WHERE booking_id=target AND acknowledgement_source='affirmative'
$$;
CREATE FUNCTION beauty.assert_policy_slot(target uuid,starts timestamptz,duration integer,exclude_booking uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE finish timestamptz:=starts+duration*interval '1 minute'; local_start timestamp:=starts AT TIME ZONE 'Europe/London'; local_finish timestamp:=finish AT TIME ZONE 'Europe/London'; rule beauty.availability_rules; instant timestamptz; BEGIN
 IF starts IS NULL OR starts<now()+interval '1 hour' OR starts>now()+interval '90 days' OR extract(epoch FROM starts)%900<>0 THEN RAISE EXCEPTION 'INVALID_TIME' USING ERRCODE='22023'; END IF;
 SELECT * INTO rule FROM beauty.availability_rules WHERE professional_id=target AND weekday=extract(dow FROM local_start);
 IF rule.id IS NULL OR (local_finish::date<>local_start::date AND NOT(local_finish::date=local_start::date+1 AND local_finish::time='00:00' AND rule.end_minute=1440)) THEN RAISE EXCEPTION 'OUTSIDE_HOURS' USING ERRCODE='22023'; END IF;
 FOR instant IN SELECT generate_series(starts,finish-interval '1 second',interval '15 minutes') LOOP
  IF extract(hour FROM instant AT TIME ZONE 'Europe/London')*60+extract(minute FROM instant AT TIME ZONE 'Europe/London') NOT BETWEEN rule.start_minute AND rule.end_minute-1 THEN RAISE EXCEPTION 'OUTSIDE_HOURS' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF local_finish::date=local_start::date AND extract(hour FROM local_finish)*60+extract(minute FROM local_finish)>rule.end_minute THEN RAISE EXCEPTION 'OUTSIDE_HOURS' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM beauty.bookings WHERE professional_id=target AND id<>exclude_booking AND starts_at<finish AND ends_at>starts AND (status='confirmed' OR(status='payment_pending' AND hold_expires_at>now()))) OR EXISTS(SELECT 1 FROM beauty.availability_blocks WHERE professional_id=target AND starts_at<finish AND ends_at>starts) THEN RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE='23P01'; END IF;
END $$;
CREATE FUNCTION beauty.policy_booking_action(target uuid,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb; actor uuid; pro boolean; b beauty.bookings; t beauty.booking_policy_terms; rule jsonb; event uuid; operation text:=payload->>'action'; prior beauty.booking_policy_events; starts timestamptz; original timestamptz; used integer; info text; health text; approved boolean; BEGIN
 identity:=beauty.policy_booking_actor(target); actor:=(identity->>'actor')::uuid; pro:=(identity->>'professional')::boolean;
 SELECT professional_id INTO b.professional_id FROM beauty.bookings WHERE id=target;
 PERFORM pg_advisory_xact_lock(hashtextextended(b.professional_id::text,0));
 SELECT * INTO b FROM beauty.bookings WHERE id=target FOR UPDATE;
 SELECT * INTO t FROM beauty.booking_policy_terms WHERE booking_id=target; rule:=t.snapshot->'rules';
 IF t.booking_id IS NULL THEN RAISE EXCEPTION 'POLICY_SNAPSHOT_REQUIRED' USING ERRCODE='22023'; END IF;
 IF operation IN('reschedule','approve_reschedule') THEN
  IF b.status<>'confirmed' OR b.starts_at<=now() THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO used FROM beauty.booking_policy_events WHERE booking_id=target AND kind='rescheduled';
  IF used>=coalesce((rule->>'maxReschedules')::int,0) THEN RAISE EXCEPTION 'RESCHEDULE_LIMIT' USING ERRCODE='22023'; END IF;
  IF operation='reschedule' THEN
   IF pro OR length(trim(coalesce(payload->>'reason',''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
   IF b.starts_at-now()<(rule->>'rescheduleHours')::int*interval '1 hour' THEN RAISE EXCEPTION 'RESCHEDULE_NOTICE' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM beauty.booking_policy_events e WHERE e.booking_id=target AND e.kind='reschedule_requested' AND NOT EXISTS(SELECT 1 FROM beauty.booking_policy_events answer WHERE answer.booking_id=target AND answer.details->>'requestId'=e.id::text)) THEN RAISE EXCEPTION 'RESCHEDULE_PENDING' USING ERRCODE='22023'; END IF;
   starts:=(payload->>'startsAt')::timestamptz; original:=b.starts_at;
   PERFORM beauty.assert_policy_slot(b.professional_id,starts,b.duration_minutes,target);
   IF starts=b.starts_at THEN RAISE EXCEPTION 'INVALID_TIME' USING ERRCODE='22023'; END IF;
   approved:=used=0 AND coalesce((rule->>'freeReschedule')::boolean,false);
   IF NOT approved THEN
    INSERT INTO beauty.booking_policy_events(booking_id,actor_id,kind,details) VALUES(target,actor,'reschedule_requested',jsonb_build_object('startsAt',starts,'originalStartsAt',b.starts_at,'reason',payload->>'reason')) RETURNING id INTO event;
   END IF;
  ELSE
   IF NOT pro OR jsonb_typeof(payload->'accepted') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
   SELECT * INTO prior FROM beauty.booking_policy_events WHERE id=(payload->>'eventId')::uuid AND booking_id=target AND kind='reschedule_requested';
   IF prior.id IS NULL OR EXISTS(SELECT 1 FROM beauty.booking_policy_events WHERE booking_id=target AND details->>'requestId'=prior.id::text) THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023'; END IF;
   starts:=(prior.details->>'startsAt')::timestamptz; original:=(prior.details->>'originalStartsAt')::timestamptz; approved:=(payload->>'accepted')::boolean;
   IF NOT approved AND length(trim(coalesce(payload->>'reason',''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'RESCHEDULE_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
   IF original<>b.starts_at OR b.starts_at-prior.created_at<(rule->>'rescheduleHours')::int*interval '1 hour' THEN RAISE EXCEPTION 'RESCHEDULE_NOTICE' USING ERRCODE='22023'; END IF;
   IF approved THEN PERFORM beauty.assert_policy_slot(b.professional_id,starts,b.duration_minutes,target); ELSE
    INSERT INTO beauty.booking_policy_events(booking_id,actor_id,kind,details) VALUES(target,actor,'reschedule_rejected',jsonb_build_object('requestId',prior.id,'reason',trim(payload->>'reason'))) RETURNING id INTO event;
   END IF;
  END IF;
  IF approved THEN
   UPDATE beauty.bookings SET starts_at=starts,ends_at=starts+duration_minutes*interval '1 minute' WHERE id=target;
   INSERT INTO beauty.booking_policy_events(booking_id,actor_id,kind,details) VALUES(target,actor,'rescheduled',jsonb_build_object('requestId',prior.id,'oldStartsAt',original,'newStartsAt',starts,'customerInitiated',true,'feePence',0)) RETURNING id INTO event;
   UPDATE beauty.notification_outbox SET due_at=greatest(now(),starts-interval '24 hours') WHERE booking_id=target AND kind='reminder' AND sent_at IS NULL;
  END IF;
  PERFORM beauty.notify_policy_booking(target,event,'rescheduled');
 ELSIF operation='late' THEN
  IF NOT pro OR b.status<>'confirmed' OR now()<b.starts_at+(rule->>'graceMinutes')::int*interval '1 minute' OR now()>=b.ends_at OR payload->>'decision' NOT IN('proceed','offer_shorten','cancel') OR length(trim(coalesce(payload->>'reason',''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_LATE_RECORD' USING ERRCODE='22023'; END IF;
  IF payload->>'decision'='offer_shorten' AND (coalesce((payload->>'shortenMinutes')::int,0) NOT BETWEEN 5 AND b.duration_minutes-5) THEN RAISE EXCEPTION 'INVALID_LATE_RECORD' USING ERRCODE='22023'; END IF;
  INSERT INTO beauty.booking_policy_events(booking_id,actor_id,kind,details) VALUES(target,actor,'late',jsonb_build_object('decision',payload->>'decision','shortenMinutes',payload->'shortenMinutes','reason',payload->>'reason','recordedAt',now(),'financialPenalty',false)) RETURNING id INTO event;
  IF payload->>'decision'='cancel' THEN
   UPDATE beauty.bookings SET status='cancelled',cancelled_at=now(),cancellation_actor='professional',cancellation_reason=payload->>'reason' WHERE id=target;
   UPDATE beauty.payments SET status='refund_required' WHERE booking_id=target AND captured_pence>refunded_pence;
   PERFORM beauty.enqueue_booking_notifications(target,'cancellation');
  END IF;
  PERFORM beauty.notify_policy_booking(target,event,'late_notice');
 ELSIF operation='accept_shorten' THEN
  IF pro OR b.status<>'confirmed' OR jsonb_typeof(payload->'accepted') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM beauty.booking_policy_events WHERE id=(payload->>'eventId')::uuid AND booking_id=target AND kind='late' AND details->>'decision'='offer_shorten';
  IF prior.id IS NULL OR EXISTS(SELECT 1 FROM beauty.booking_policy_events WHERE booking_id=target AND details->>'offerId'=prior.id::text) THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023'; END IF;
  INSERT INTO beauty.booking_policy_events(booking_id,actor_id,kind,details) VALUES(target,actor,CASE WHEN (payload->>'accepted')::boolean THEN 'shorten_accepted' ELSE 'shorten_rejected' END,jsonb_build_object('offerId',prior.id,'shortenMinutes',prior.details->'shortenMinutes','priceUnchanged',true)) RETURNING id INTO event;
  PERFORM beauty.notify_policy_booking(target,event,'late_notice');
 ELSIF operation IN('requirements','withdraw_health') THEN
  IF pro OR (operation='requirements' AND b.status NOT IN('payment_pending','confirmed')) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF operation='withdraw_health' THEN UPDATE beauty.booking_preparation SET health_info=NULL,health_consent_at=NULL,professional_ready_at=NULL,updated_at=now() WHERE booking_id=target; ELSE
   info:=coalesce(payload->>'preparationInfo','');health:=nullif(trim(payload->>'healthInfo'),'');
   IF length(info)>1500 OR length(coalesce(health,''))>1000 OR (health IS NOT NULL AND payload->>'healthConsent' IS DISTINCT FROM 'true') OR jsonb_typeof(payload->'consultationDone') IS DISTINCT FROM 'boolean' OR jsonb_typeof(payload->'patchTestDone') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_REQUIREMENTS' USING ERRCODE='22023'; END IF;
   INSERT INTO beauty.booking_preparation(booking_id,preparation_info,health_info,health_consent_at,consultation_done,patch_test_done) VALUES(target,info,health,CASE WHEN health IS NOT NULL THEN now() END,(payload->>'consultationDone')::boolean,(payload->>'patchTestDone')::boolean)
   ON CONFLICT(booking_id) DO UPDATE SET preparation_info=excluded.preparation_info,health_info=excluded.health_info,health_consent_at=excluded.health_consent_at,consultation_done=excluded.consultation_done,patch_test_done=excluded.patch_test_done,professional_ready_at=NULL,updated_at=now();
  END IF;
  INSERT INTO beauty.booking_policy_events(booking_id,actor_id,kind,details) VALUES(target,actor,'requirements',jsonb_build_object('updated',true,'healthConsentWithdrawn',operation='withdraw_health')) RETURNING id INTO event;
  PERFORM beauty.notify_policy_booking(target,event,'requirements_update');
 ELSIF operation='ready' THEN
  IF NOT pro OR b.status<>'confirmed' OR payload->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF ((rule->>'requireReferences')::boolean AND NOT EXISTS(SELECT 1 FROM beauty.booking_reference_photos WHERE booking_id=target)) OR ((rule->>'requireConsultation')::boolean AND NOT EXISTS(SELECT 1 FROM beauty.booking_preparation WHERE booking_id=target AND consultation_done)) OR ((rule->>'requirePatchTest')::boolean AND NOT EXISTS(SELECT 1 FROM beauty.booking_preparation WHERE booking_id=target AND patch_test_done)) THEN RAISE EXCEPTION 'REQUIREMENTS_INCOMPLETE' USING ERRCODE='22023'; END IF;
  INSERT INTO beauty.booking_preparation(booking_id,professional_ready_at) VALUES(target,now()) ON CONFLICT(booking_id) DO UPDATE SET professional_ready_at=now(),updated_at=now();
  INSERT INTO beauty.booking_policy_events(booking_id,actor_id,kind,details) VALUES(target,actor,'requirements_ready',jsonb_build_object('professionalVerified',true,'clinicalConsentStillRequired',true)) RETURNING id INTO event;
  PERFORM beauty.notify_policy_booking(target,event,'requirements_update');
 ELSIF operation='retention' THEN
  IF NOT pro OR b.status<>'cancelled' OR (beauty.policy_refund_assessment(target)->>'mandatoryFullRefund')::boolean OR (payload->>'lossPence')::int NOT BETWEEN 1 AND b.deposit_pence OR length(trim(coalesce(payload->>'evidence',''))) NOT BETWEEN 20 AND 2000 OR length(trim(coalesce(payload->>'mitigation',''))) NOT BETWEEN 20 AND 1000 THEN RAISE EXCEPTION 'INVALID_RETENTION_REVIEW' USING ERRCODE='22023'; END IF;
  INSERT INTO beauty.booking_retention_reviews(booking_id,requested_by,loss_pence,evidence,mitigation) VALUES(target,actor,(payload->>'lossPence')::int,payload->>'evidence',payload->>'mitigation');
  INSERT INTO beauty.booking_policy_events(booking_id,actor_id,kind,details) VALUES(target,actor,'retention_requested',jsonb_build_object('lossPence',payload->'lossPence','reviewRequired',true)) RETURNING id INTO event;
 ELSE RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('saved',true,'eventId',event);
END $$;

CREATE FUNCTION beauty.admin_policy_overview(search text DEFAULT '',target_booking uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_admin();
 IF length(coalesce(search,''))>100 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('versions',coalesce((SELECT jsonb_agg(x) FROM(SELECT v.*,r.status AS review_status,r.reason AS review_reason,r.published_at,s.professional_id,p.business_name AS professional_name,svc.name AS service_name,s.published_version_id=v.id AS current FROM beauty.professional_policy_versions v JOIN beauty.professional_policy_scopes s ON s.id=v.scope_id JOIN beauty.professional_policy_reviews r ON r.version_id=v.id JOIN beauty.professional_profiles p ON p.id=s.professional_id LEFT JOIN beauty.services svc ON svc.id=s.service_id WHERE p.business_name ILIKE '%'||coalesce(search,'')||'%' OR p.slug=search OR p.id::text=search ORDER BY (r.status='pending') DESC,v.created_at DESC LIMIT 100)x),'[]'),
 'bookings',coalesce((SELECT jsonb_agg(x) FROM(SELECT b.id,b.professional_name,b.customer_name,b.service_name,t.acknowledged_at,t.snapshot FROM beauty.bookings b JOIN beauty.booking_policy_terms t ON t.booking_id=b.id WHERE (target_booking IS NULL OR b.id=target_booking) AND (b.professional_name ILIKE '%'||coalesce(search,'')||'%' OR b.professional_id::text=search OR EXISTS(SELECT 1 FROM beauty.professional_profiles lookup WHERE lookup.id=b.professional_id AND lookup.slug=search)) ORDER BY b.created_at DESC LIMIT 100)x),'[]'),
 'retentions',coalesce((SELECT jsonb_agg(x) FROM(SELECT r.booking_id,b.professional_name,b.customer_name,r.loss_pence,r.evidence,r.mitigation,r.status FROM beauty.booking_retention_reviews r JOIN beauty.bookings b ON b.id=r.booking_id WHERE (target_booking IS NULL OR b.id=target_booking) AND (b.professional_name ILIKE '%'||coalesce(search,'')||'%' OR b.professional_id::text=search OR EXISTS(SELECT 1 FROM beauty.professional_profiles lookup WHERE lookup.id=b.professional_id AND lookup.slug=search)) ORDER BY (r.status='pending') DESC,r.created_at DESC LIMIT 100)x),'[]'),
 'audit',coalesce((SELECT jsonb_agg(x) FROM(SELECT a.id,a.action,a.version_id,a.actor_id,u.display_name AS actor_name,p.business_name AS professional_name,a.reason,a.created_at FROM beauty.professional_policy_audit a JOIN beauty.professional_profiles p ON p.id=a.professional_id JOIN beauty.users u ON u.id=a.actor_id WHERE p.business_name ILIKE '%'||coalesce(search,'')||'%' OR p.slug=search OR p.id::text=search ORDER BY a.created_at DESC,a.id DESC LIMIT 100)x),'[]'),
 'disputes',coalesce((SELECT jsonb_agg(x) FROM(SELECT d.id,d.booking_id,d.status,d.amount_pence,d.updated_at,b.professional_name FROM beauty.booking_disputes d JOIN beauty.bookings b ON b.id=d.booking_id WHERE (target_booking IS NULL OR b.id=target_booking) AND (b.professional_name ILIKE '%'||coalesce(search,'')||'%' OR b.professional_id::text=search OR EXISTS(SELECT 1 FROM beauty.professional_profiles lookup WHERE lookup.id=b.professional_id AND lookup.slug=search)) ORDER BY d.updated_at DESC LIMIT 100)x),'[]'));
END $$;
CREATE FUNCTION beauty.admin_policy_action(payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; operation text:=payload->>'action'; v beauty.professional_policy_versions; s beauty.professional_policy_scopes; previous jsonb; target uuid; recipient uuid; BEGIN
 actor:=beauty.require_admin();
 IF payload->>'confirmed' IS DISTINCT FROM 'true' OR length(trim(coalesce(payload->>'reason',''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'CONFIRMATION_REQUIRED' USING ERRCODE='22023'; END IF;
 IF operation='retention' THEN
  target:=(payload->>'bookingId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended((SELECT professional_id::text FROM beauty.bookings WHERE id=target),0));
  PERFORM 1 FROM beauty.bookings WHERE id=target FOR UPDATE;
  SELECT to_jsonb(r) INTO previous FROM beauty.booking_retention_reviews r WHERE booking_id=target FOR UPDATE;
  IF previous IS NULL OR previous->>'status'<>'pending' OR jsonb_typeof(payload->'approved') IS DISTINCT FROM 'boolean' OR ((payload->>'approved')::boolean AND (beauty.policy_refund_assessment(target)->>'mandatoryFullRefund')::boolean) THEN RAISE EXCEPTION 'INVALID_RETENTION_REVIEW' USING ERRCODE='22023'; END IF;
  UPDATE beauty.booking_retention_reviews SET status=CASE WHEN (payload->>'approved')::boolean THEN 'approved' ELSE 'rejected' END,reviewed_by=actor,review_reason=payload->>'reason',reviewed_at=now() WHERE booking_id=target;
  INSERT INTO beauty.professional_policy_audit(actor_id,professional_id,action,previous_state,new_state,reason) SELECT actor,b.professional_id,'retention_review',previous,to_jsonb(r),payload->>'reason' FROM beauty.bookings b JOIN beauty.booking_retention_reviews r ON r.booking_id=b.id WHERE b.id=target;
 ELSE
  SELECT * INTO v FROM beauty.professional_policy_versions WHERE id=(payload->>'versionId')::uuid;
  SELECT * INTO s FROM beauty.professional_policy_scopes WHERE id=v.scope_id;
  IF s.id IS NULL OR operation NOT IN('approve','reject','flag') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('policies:'||s.professional_id::text,0));
  SELECT * INTO s FROM beauty.professional_policy_scopes WHERE id=s.id FOR UPDATE;
  SELECT to_jsonb(r) INTO previous FROM beauty.professional_policy_reviews r WHERE version_id=v.id FOR UPDATE;
  IF operation IN('approve','reject') AND previous->>'status'<>'pending' THEN RAISE EXCEPTION 'REVIEW_ALREADY_RESOLVED' USING ERRCODE='22023'; END IF;
  IF operation='approve' AND (s.revision<>v.requested_revision OR EXISTS(SELECT 1 FROM beauty.professional_policy_versions newer WHERE newer.scope_id=s.id AND newer.version>v.version)) THEN RAISE EXCEPTION 'POLICY_EDIT_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE beauty.professional_policy_reviews SET status=CASE operation WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'flagged' END,reason=payload->>'reason',reviewed_by=actor,reviewed_at=now(),published_at=CASE WHEN operation='approve' THEN now() ELSE published_at END WHERE version_id=v.id;
  UPDATE beauty.professional_policy_scopes SET published_version_id=CASE WHEN operation='approve' THEN v.id WHEN published_version_id=v.id THEN NULL ELSE published_version_id END,revision=revision+1,updated_at=now() WHERE id=s.id;
  INSERT INTO beauty.professional_policy_audit(actor_id,professional_id,action,version_id,previous_state,new_state,reason) SELECT actor,s.professional_id,operation,v.id,previous,to_jsonb(r),payload->>'reason' FROM beauty.professional_policy_reviews r WHERE version_id=v.id;
  SELECT user_id INTO recipient FROM beauty.professional_profiles WHERE id=s.professional_id;
  INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href) VALUES(recipient,'professional_policy_review','Your booking policies were reviewed','Policy version '||v.version::text||': '||operation||'. Open Rules & Policies for the review reason.','/professional/policies');
 END IF;
END $$;

ALTER FUNCTION beauty.change_booking(uuid,text,text) RENAME TO change_booking_before_policies;
REVOKE ALL ON FUNCTION beauty.change_booking_before_policies(uuid,text,text) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.change_booking(target uuid,next_status text,reason text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb; t beauty.booking_policy_terms; r jsonb; BEGIN
 identity:=beauty.policy_booking_actor(target);
 SELECT * INTO t FROM beauty.booking_policy_terms WHERE booking_id=target;
 r:=t.snapshot->'rules';
 IF next_status='completed' AND t.acknowledgement_source='affirmative' AND ((r->>'requireReferences')::boolean OR (r->>'requireConsultation')::boolean OR (r->>'requirePatchTest')::boolean) AND NOT EXISTS(SELECT 1 FROM beauty.booking_preparation WHERE booking_id=target AND professional_ready_at IS NOT NULL) THEN RAISE EXCEPTION 'REQUIREMENTS_INCOMPLETE' USING ERRCODE='22023'; END IF;
 PERFORM beauty.change_booking_before_policies(target,next_status,reason);
 IF next_status='no_show' AND t.acknowledgement_source='affirmative' THEN
  INSERT INTO beauty.booking_policy_events(booking_id,actor_id,kind,details) VALUES(target,(identity->>'actor')::uuid,'no_show_review',jsonb_build_object('reviewRequired',true,'financialPenalty',false));
  UPDATE beauty.payments SET status='refund_required' WHERE booking_id=target AND captured_pence>refunded_pence;
 END IF;
END $$;
ALTER FUNCTION beauty.decide_refund(uuid,boolean,integer,text) RENAME TO decide_refund_before_policies;
REVOKE ALL ON FUNCTION beauty.decide_refund_before_policies(uuid,boolean,integer,text) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.decide_refund(target uuid,accepted boolean,percentage integer,decision_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b beauty.bookings; p beauty.payments; t beauty.booking_policy_terms; assessment jsonb; d beauty.refund_decisions; actor uuid; proposed integer; amount integer; chosen integer; BEGIN
 SELECT * INTO t FROM beauty.booking_policy_terms WHERE booking_id=target;
 IF t.acknowledgement_source IS DISTINCT FROM 'affirmative' THEN RETURN beauty.decide_refund_before_policies(target,accepted,percentage,decision_reason); END IF;
 SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';
 SELECT * INTO b FROM beauty.bookings WHERE id=target FOR UPDATE;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=b.professional_id AND user_id=actor) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF b.status NOT IN('cancelled','expired','no_show') AND NOT(b.status='payment_pending' AND b.hold_expires_at<=now()) THEN RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE='22023'; END IF;
 IF accepted IS NULL OR percentage IS NULL OR percentage NOT BETWEEN 0 AND 100 OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM beauty.payments WHERE booking_id=target FOR UPDATE;
 SELECT * INTO d FROM beauty.refund_decisions WHERE booking_id=target;
 IF d.id IS NOT NULL THEN RETURN jsonb_build_object('id',d.id,'amountPence',d.amount_pence,'paymentIntentId',p.stripe_payment_intent_id,'status',d.status); END IF;
 IF p.status='pending' THEN RAISE EXCEPTION 'PAYMENT_NOT_SETTLED' USING ERRCODE='22023'; END IF;
 assessment:=beauty.policy_refund_assessment(target);
 chosen:=CASE WHEN (assessment->>'mandatoryFullRefund')::boolean THEN 100 WHEN accepted THEN percentage ELSE 0 END;
 amount:=greatest(0,floor(p.captured_pence*chosen/100.0)::integer-p.refunded_pence);
 IF amount<(assessment->>'minimumRefundPence')::integer THEN RAISE EXCEPTION 'RETENTION_REVIEW_REQUIRED' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.refund_decisions(booking_id,actor_id,reasonable_cause_accepted,refund_percent,amount_pence,reason,status) VALUES(target,actor,accepted,chosen,amount,trim(decision_reason),CASE WHEN amount=0 THEN 'no_refund' ELSE 'queued' END) RETURNING * INTO d;
 IF amount=0 THEN UPDATE beauty.payments SET status=CASE WHEN refunded_pence>0 THEN 'partially_refunded' ELSE 'paid' END WHERE booking_id=target; END IF;
 RETURN jsonb_build_object('id',d.id,'amountPence',d.amount_pence,'paymentIntentId',p.stripe_payment_intent_id,'status',d.status);
END $$;

CREATE FUNCTION beauty.add_booking_reference_photo(target uuid,picture bytea) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity jsonb; result uuid; BEGIN
 identity:=beauty.policy_booking_actor(target);
 PERFORM 1 FROM beauty.bookings WHERE id=target FOR UPDATE;
 IF (identity->>'professional')::boolean OR NOT EXISTS(SELECT 1 FROM beauty.bookings WHERE id=target AND status IN('payment_pending','confirmed') AND ends_at>now()) OR octet_length(picture) NOT BETWEEN 1 AND 500000 OR picture IS NULL THEN RAISE EXCEPTION 'INVALID_REFERENCE_PHOTO' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM beauty.booking_reference_photos WHERE booking_id=target)>=3 THEN RAISE EXCEPTION 'REFERENCE_PHOTO_LIMIT' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.booking_reference_photos(booking_id,image) VALUES(target,picture) RETURNING id INTO result;
 UPDATE beauty.booking_preparation SET professional_ready_at=NULL WHERE booking_id=target;
 RETURN result;
END $$;
-- Admin appeal decisions use the same accepted-policy refund floor as professional decisions.
ALTER FUNCTION beauty.resolve_refund_appeal(uuid,boolean,integer,text) RENAME TO resolve_refund_appeal_before_policies;
REVOKE ALL ON FUNCTION beauty.resolve_refund_appeal_before_policies(uuid,boolean,integer,text) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.resolve_refund_appeal(target uuid,approved boolean,percentage integer,decision_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a beauty.refund_appeals;t beauty.booking_policy_terms;p beauty.payments;assessment jsonb;amount integer; BEGIN
 PERFORM beauty.require_admin();
 SELECT * INTO a FROM beauty.refund_appeals WHERE id=target FOR UPDATE;
 SELECT * INTO t FROM beauty.booking_policy_terms WHERE booking_id=a.booking_id;
 IF t.acknowledgement_source='affirmative' THEN
  PERFORM 1 FROM beauty.bookings WHERE id=a.booking_id FOR UPDATE;
  SELECT * INTO p FROM beauty.payments WHERE booking_id=a.booking_id FOR UPDATE;
  assessment:=beauty.policy_refund_assessment(a.booking_id);
  amount:=CASE WHEN approved THEN greatest(0,floor(p.captured_pence*percentage/100.0)::integer-p.refunded_pence) ELSE 0 END;
  IF amount<(assessment->>'minimumRefundPence')::integer THEN RAISE EXCEPTION 'RETENTION_REVIEW_REQUIRED' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN beauty.resolve_refund_appeal_before_policies(target,approved,percentage,decision_reason);
END $$;
CREATE FUNCTION beauty.read_booking_reference_photo(target uuid,photo uuid) RETURNS bytea LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.policy_booking_actor(target); RETURN (SELECT image FROM beauty.booking_reference_photos WHERE id=photo AND booking_id=target);
END $$;
CREATE FUNCTION beauty.delete_booking_reference_photo(target uuid,photo uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF (beauty.policy_booking_actor(target)->>'professional')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 DELETE FROM beauty.booking_reference_photos WHERE id=photo AND booking_id=target;
 UPDATE beauty.booking_preparation SET professional_ready_at=NULL WHERE booking_id=target;
END $$;
CREATE FUNCTION beauty.purge_booking_preparation() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE infos integer; photos integer; BEGIN
 UPDATE beauty.booking_preparation p SET health_info=NULL,health_consent_at=NULL,preparation_info='' FROM beauty.bookings b WHERE b.id=p.booking_id AND b.ends_at<now()-interval '30 days' AND (p.health_info IS NOT NULL OR p.preparation_info<>''); GET DIAGNOSTICS infos=ROW_COUNT;
 DELETE FROM beauty.booking_reference_photos p USING beauty.bookings b WHERE b.id=p.booking_id AND b.ends_at<now()-interval '30 days'; GET DIAGNOSTICS photos=ROW_COUNT;
 RETURN jsonb_build_object('preparationPurged',infos,'referencePhotosPurged',photos);
END $$;

-- Restricted function owners, explicit callers, no public schema or broad runtime role membership.
DO $$ DECLARE f record; target_role text; BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname IN('default_booking_policy','validate_professional_policy','policy_actor_professional','save_my_professional_policy','my_policy_workspace','public_service_policy','policy_booking_deposit','reserve_booking','policy_booking_actor','policy_refund_assessment','booking_policy_overview','notify_policy_booking','assert_policy_slot','policy_booking_action','admin_policy_overview','admin_policy_action','change_booking','decide_refund','add_booking_reference_photo','read_booking_reference_photo','delete_booking_reference_photo','purge_booking_preparation') LOOP
  -- Retention review locks an existing booking just like the existing refund-appeal path.
  -- Reuse its operator instead of granting the Admin read operator booking UPDATE rights.
  target_role:=CASE WHEN f.proname='admin_policy_overview' THEN 'beauty_admin_ops' ELSE 'beauty_booking_ops' END;
  EXECUTE format('GRANT CREATE ON SCHEMA beauty TO %I',target_role);
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I',f.oid::regprocedure,target_role);
  EXECUTE format('REVOKE CREATE ON SCHEMA beauty FROM %I',target_role);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,beauty_app',f.oid::regprocedure);
 END LOOP;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.policy_cooling_off_end(timestamptz) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.notification_booking_policy(uuid) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.resolve_refund_appeal(uuid,boolean,integer,text) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.policy_cooling_off_end(timestamptz),beauty.notification_booking_policy(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.policy_cooling_off_end(timestamptz) TO beauty_app,beauty_booking_ops;
GRANT EXECUTE ON FUNCTION beauty.notification_booking_policy(uuid) TO beauty_payment_worker;
REVOKE ALL ON FUNCTION beauty.resolve_refund_appeal(uuid,boolean,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.resolve_refund_appeal(uuid,boolean,integer,text) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.default_booking_policy() TO beauty_booking_ops;
GRANT EXECUTE ON FUNCTION beauty.public_booking_fee_pence(),beauty.professional_access_state(uuid) TO beauty_booking_ops;
GRANT EXECUTE ON FUNCTION beauty.public_service_policy(uuid) TO beauty_app,beauty_booking_ops;
GRANT EXECUTE ON FUNCTION beauty.policy_actor_professional(),beauty.default_booking_policy(),beauty.validate_professional_policy(jsonb,boolean),beauty.policy_booking_actor(uuid),beauty.policy_refund_assessment(uuid),beauty.notify_policy_booking(uuid,uuid,text),beauty.assert_policy_slot(uuid,timestamptz,integer,uuid) TO beauty_booking_ops;
GRANT EXECUTE ON FUNCTION beauty.policy_refund_assessment(uuid) TO beauty_admin_ops;
GRANT EXECUTE ON FUNCTION beauty.save_my_professional_policy(uuid,text,integer,jsonb),beauty.my_policy_workspace(),beauty.reserve_booking(uuid,timestamptz,text,boolean),beauty.booking_policy_overview(uuid),beauty.policy_booking_action(uuid,jsonb),beauty.admin_policy_overview(text,uuid),beauty.admin_policy_action(jsonb),beauty.change_booking(uuid,text,text),beauty.decide_refund(uuid,boolean,integer,text),beauty.add_booking_reference_photo(uuid,bytea),beauty.read_booking_reference_photo(uuid,uuid),beauty.delete_booking_reference_photo(uuid,uuid) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.purge_booking_preparation() TO beauty_payment_worker;
CREATE FUNCTION beauty.policy_reschedule_busy(target uuid,day_start timestamptz,day_end timestamptz) RETURNS TABLE(starts_at timestamptz,ends_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid; BEGIN
 PERFORM beauty.policy_booking_actor(target);
 IF day_end<=day_start OR day_end-day_start>interval '3 days' THEN RETURN; END IF;
 SELECT professional_id INTO pro FROM beauty.bookings WHERE id=target;
 RETURN QUERY SELECT b.starts_at,b.ends_at FROM beauty.bookings b WHERE b.professional_id=pro AND b.id<>target AND b.starts_at<day_end AND b.ends_at>day_start AND (b.status='confirmed' OR(b.status='payment_pending' AND b.hold_expires_at>now())) UNION ALL SELECT a.starts_at,a.ends_at FROM beauty.availability_blocks a WHERE a.professional_id=pro AND a.starts_at<day_end AND a.ends_at>day_start;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.policy_reschedule_busy(uuid,timestamptz,timestamptz) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.policy_reschedule_busy(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.policy_reschedule_busy(uuid,timestamptz,timestamptz) TO beauty_app;

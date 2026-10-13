-- Staged only. Controls default OFF; production requires Owner activation.
-- Pricing snapshots are private one-to-one records linked to each booking/payment.
CREATE TABLE beauty.commission_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 new_promotions_enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO beauty.commission_settings(id) VALUES(true);
CREATE TABLE beauty.commission_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN('platform','individual','founding_trial','founding_reward')),
 professional_id uuid REFERENCES beauty.professional_profiles(id), scope text NOT NULL DEFAULT 'all' CHECK(scope IN('all','verified','unverified','starter','pro','premium')),
 basis_points integer NOT NULL CHECK(basis_points BETWEEN 0 AND 5000),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, cancelled_from timestamptz,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 created_by uuid NOT NULL REFERENCES beauty.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 pricing_version text NOT NULL DEFAULT 'commission-v2',
 CHECK(ends_at>starts_at), CHECK(cancelled_from IS NULL OR cancelled_from>=created_at),
 CHECK((kind='platform' AND professional_id IS NULL) OR (kind<>'platform' AND professional_id IS NOT NULL)),
 CHECK(kind NOT IN('founding_trial','founding_reward') OR (basis_points=0 AND cancelled_from IS NULL))
);
CREATE INDEX commission_rules_professional_window ON beauty.commission_rules(professional_id,starts_at,ends_at);
CREATE UNIQUE INDEX founding_once_per_phase ON beauty.commission_rules(professional_id,kind) WHERE kind IN('founding_trial','founding_reward');
CREATE TABLE beauty.founding_participants (
 professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
 trial_rule_id uuid NOT NULL REFERENCES beauty.commission_rules(id), reward_rule_id uuid REFERENCES beauty.commission_rules(id),
 questionnaire jsonb, submitted_at timestamptz, qualified_at timestamptz, qualified_by uuid REFERENCES beauty.users(id),
 CHECK((questionnaire IS NULL)=(submitted_at IS NULL)),
 CHECK(questionnaire IS NULL OR jsonb_typeof(questionnaire)='object')
);
CREATE TABLE beauty.commission_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 rule_id uuid REFERENCES beauty.commission_rules(id), body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), effective_at timestamptz NOT NULL,
 email_sent_at timestamptz, provider_email_id text, attempts integer NOT NULL DEFAULT 0, claimed_at timestamptz
);
CREATE INDEX commission_notices_recipient ON beauty.commission_notices(professional_id,created_at DESC);
CREATE TABLE beauty.booking_commission_terms (
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id), professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 rule_id uuid REFERENCES beauty.commission_rules(id), rule_reference text NOT NULL, pricing_version text NOT NULL,
 basis_points integer NOT NULL CHECK(basis_points BETWEEN 0 AND 5000), standard_basis_points integer NOT NULL CHECK(standard_basis_points BETWEEN 0 AND 5000),
 commission_pence integer NOT NULL CHECK(commission_pence>=0), waived_pence integer NOT NULL CHECK(waived_pence>=0),
 customer_fee_pence integer NOT NULL CHECK(customer_fee_pence>=0), agreed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.payment_commission_terms (
 booking_id uuid PRIMARY KEY REFERENCES beauty.payments(booking_id), rule_reference text NOT NULL, rule_id uuid REFERENCES beauty.commission_rules(id),
 pricing_version text NOT NULL, basis_points integer NOT NULL CHECK(basis_points BETWEEN 0 AND 5000), commission_pence integer NOT NULL CHECK(commission_pence>=0)
);
CREATE TABLE beauty.booking_provider_costs (
 booking_id uuid PRIMARY KEY REFERENCES beauty.payments(booking_id), stripe_balance_transaction_id text UNIQUE NOT NULL,
 charge_pence integer NOT NULL CHECK(charge_pence>0), fee_pence integer NOT NULL CHECK(fee_pence>=0), recorded_at timestamptz NOT NULL DEFAULT now()
);
-- Private schema, forced RLS, no browser/Data API access. Restricted NOLOGIN workers only.
DO $$ DECLARE t text; r text; BEGIN
 FOR t IN SELECT unnest(ARRAY['commission_settings','commission_rules','founding_participants','commission_notices','booking_commission_terms','payment_commission_terms','booking_provider_costs']) LOOP
  EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
  FOREACH r IN ARRAY ARRAY['beauty_admin_ops','beauty_financial_worker','beauty_payment_worker','beauty_booking_ops'] LOOP
   EXECUTE format('GRANT SELECT ON beauty.%I TO %I',t,r);
   EXECUTE format('CREATE POLICY %I ON beauty.%I FOR SELECT TO %I USING(true)',t||'_'||r,t,r);
  END LOOP;
 END LOOP;
 FOR t IN SELECT unnest(ARRAY['commission_settings','commission_rules','founding_participants','commission_notices']) LOOP
  EXECUTE format('GRANT INSERT,UPDATE ON beauty.%I TO beauty_admin_ops',t);
  EXECUTE format('CREATE POLICY %I ON beauty.%I FOR ALL TO beauty_admin_ops USING(true) WITH CHECK(true)',t||'_admin_write',t);
 END LOOP;
 FOR t IN SELECT unnest(ARRAY['booking_commission_terms','payment_commission_terms']) LOOP
  EXECUTE format('GRANT INSERT ON beauty.%I TO beauty_financial_worker',t);
  EXECUTE format('CREATE POLICY %I ON beauty.%I FOR INSERT TO beauty_financial_worker WITH CHECK(true)',t||'_snapshot_write',t);
 END LOOP;
END $$;
GRANT INSERT ON beauty.booking_provider_costs TO beauty_payment_worker;
CREATE POLICY booking_cost_worker_write ON beauty.booking_provider_costs FOR INSERT TO beauty_payment_worker WITH CHECK(true);
GRANT UPDATE ON beauty.commission_notices TO beauty_payment_worker;
CREATE POLICY commission_notice_worker_write ON beauty.commission_notices FOR UPDATE TO beauty_payment_worker USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.financial_admin_audit_logs TO beauty_admin_ops;
CREATE POLICY commission_audit_admin_read ON beauty.financial_admin_audit_logs FOR SELECT TO beauty_admin_ops USING(true);

CREATE FUNCTION beauty.standard_service_commission(target uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN coalesce((beauty.professional_access_state(target)->>'verified')::boolean,false)=false THEN 1000
 ELSE coalesce((SELECT d.service_commission_basis_points FROM beauty.professional_subscriptions s JOIN beauty.professional_plan_definitions d ON d.plan_key=s.plan_key
 WHERE s.professional_id=target AND s.status='active' AND d.active),800) END
$$;
-- Canonical current production fallback, including existing commercial agreements.
CREATE OR REPLACE FUNCTION beauty.professional_service_commission_basis_points(target uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT service_commission_basis_points FROM beauty.professional_commission_overrides WHERE professional_id=target AND (effective_until IS NULL OR effective_until>now())),beauty.standard_service_commission(target))
$$;
CREATE FUNCTION beauty.resolve_service_commission(target uuid, at_time timestamptz DEFAULT now(), simulate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected beauty.commission_rules; baseline integer; legacy beauty.professional_commission_overrides; verified boolean; plan text;
BEGIN
 baseline:=beauty.standard_service_commission(target);
 SELECT * INTO legacy FROM beauty.professional_commission_overrides WHERE professional_id=target AND (effective_until IS NULL OR effective_until>at_time);
 SELECT coalesce((beauty.professional_access_state(target)->>'verified')::boolean,false) INTO verified;
 SELECT coalesce((SELECT plan_key FROM beauty.professional_subscriptions WHERE professional_id=target AND status='active'),'starter') INTO plan;
 IF simulate OR (SELECT enabled FROM beauty.commission_settings WHERE id) THEN
  SELECT r.* INTO selected FROM beauty.commission_rules r WHERE r.starts_at<=at_time AND r.ends_at>at_time
   AND (r.cancelled_from IS NULL OR r.cancelled_from>at_time)
   AND (r.professional_id=target OR r.professional_id IS NULL)
   AND (simulate OR r.basis_points<=coalesce(legacy.service_commission_basis_points,baseline) OR EXISTS(SELECT 1 FROM beauty.commission_notices n WHERE n.rule_id=r.id AND n.professional_id=target AND n.created_at<=at_time-interval '24 hours'))
   AND (r.scope='all' OR (r.scope='verified' AND verified) OR (r.scope='unverified' AND NOT verified) OR (verified AND r.scope=plan))
  ORDER BY CASE r.kind WHEN 'founding_trial' THEN 0 WHEN 'founding_reward' THEN 0 WHEN 'individual' THEN 1 ELSE 3 END,
   r.starts_at DESC,r.created_at DESC,r.id DESC LIMIT 1;
  -- Legacy individual agreements outrank global promotions, but not earned founding rewards/new individual rules.
  IF legacy.professional_id IS NOT NULL AND selected.kind='platform' THEN selected:=NULL; END IF;
 END IF;
 RETURN jsonb_build_object('basisPoints',coalesce(selected.basis_points,legacy.service_commission_basis_points,baseline),
  'standardBasisPoints',baseline,'ruleId',selected.id,'ruleReference',coalesce(selected.id::text,CASE WHEN legacy.professional_id IS NOT NULL THEN 'legacy-individual:'||target::text||':'||legacy.updated_at::text ELSE 'standard:'||CASE WHEN verified THEN plan ELSE 'trial' END END),
  'pricingVersion',coalesce(selected.pricing_version,'commission-v2-baseline'),'expiresAt',coalesce(selected.ends_at,legacy.effective_until));
END $$;

CREATE FUNCTION beauty.snapshot_booking_commission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rule jsonb; total integer; BEGIN
 rule:=beauty.resolve_service_commission(NEW.professional_id);
 total:=round(NEW.price_pence::numeric*(rule->>'basisPoints')::integer/10000)::integer;
 -- For new promoted quotes, never release proceeds while commission is under-collected.
 IF total>NEW.deposit_pence THEN RAISE EXCEPTION 'COMMISSION_EXCEEDS_DEPOSIT' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.booking_commission_terms(booking_id,professional_id,rule_id,rule_reference,pricing_version,basis_points,standard_basis_points,commission_pence,waived_pence,customer_fee_pence)
 VALUES(NEW.id,NEW.professional_id,(rule->>'ruleId')::uuid,rule->>'ruleReference',rule->>'pricingVersion',(rule->>'basisPoints')::integer,(rule->>'standardBasisPoints')::integer,total,
 greatest(0,round(NEW.price_pence::numeric*(rule->>'standardBasisPoints')::integer/10000)::integer-total),beauty.public_booking_fee_pence());
 RETURN NEW;
END $$;
CREATE TRIGGER booking_commission_snapshot AFTER INSERT ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.snapshot_booking_commission();
CREATE FUNCTION beauty.snapshot_payment_commission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 INSERT INTO beauty.payment_commission_terms(booking_id,rule_reference,rule_id,pricing_version,basis_points,commission_pence)
 SELECT NEW.booking_id,rule_reference,rule_id,pricing_version,basis_points,commission_pence FROM beauty.booking_commission_terms WHERE booking_id=NEW.booking_id;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_commission_snapshot AFTER INSERT ON beauty.payments FOR EACH ROW EXECUTE FUNCTION beauty.snapshot_payment_commission();
-- Preserve exact legacy financial snapshots. Never reprice historical bookings.
INSERT INTO beauty.booking_commission_terms(booking_id,professional_id,rule_reference,pricing_version,basis_points,standard_basis_points,commission_pence,waived_pence,customer_fee_pence,agreed_at)
 SELECT b.id,b.professional_id,'legacy-quote:'||q.id,'legacy-quote-v1',q.professional_commission_basis_points,q.professional_commission_basis_points,q.professional_commission_total_pence,0,q.customer_platform_fee_pence,q.created_at
 FROM beauty.bookings b JOIN beauty.financial_quotes q ON q.booking_id=b.id WHERE q.professional_commission_basis_points IS NOT NULL;
INSERT INTO beauty.payment_commission_terms(booking_id,rule_reference,pricing_version,basis_points,commission_pence)
 SELECT t.booking_id,t.rule_reference,t.pricing_version,t.basis_points,t.commission_pence FROM beauty.booking_commission_terms t JOIN beauty.payments p ON p.booking_id=t.booking_id;

ALTER TABLE beauty.in_app_notifications DROP CONSTRAINT in_app_notifications_kind_check;
ALTER TABLE beauty.in_app_notifications ADD CONSTRAINT in_app_notifications_kind_check CHECK(kind IN(
 'booking_created','booking_confirmed','booking_cancelled','appointment_completed','booking_reminder','order_paid','order_processing','order_shipped','order_delivered','order_refund_pending','order_refunded','order_shipping_reminder','commission_changed'));
GRANT INSERT ON beauty.in_app_notifications TO beauty_admin_ops;
CREATE POLICY commission_inbox_insert ON beauty.in_app_notifications FOR INSERT TO beauty_admin_ops WITH CHECK(true);
CREATE FUNCTION beauty.commission_notice(target uuid, target_rule uuid, message text, effective timestamptz) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 INSERT INTO beauty.commission_notices(professional_id,rule_id,body,effective_at) VALUES(target,target_rule,message,effective);
 INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href)
 SELECT user_id,'commission_changed','Your service commission notice',left(message,500),'/professional/commission' FROM beauty.professional_profiles WHERE id=target;
END $$;
CREATE FUNCTION beauty.owner_commission_action(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; action text:=payload->>'action'; reason text:=trim(payload->>'reason'); target uuid; result beauty.commission_rules;
 prior jsonb:='{}'; previous beauty.commission_rules; settings beauty.commission_settings; participant beauty.founding_participants;
 start_time timestamptz; end_time timestamptz; pro record; bp integer;
BEGIN
 actor:=beauty.require_owner();
 IF payload->>'confirmed' IS DISTINCT FROM 'true' OR length(coalesce(reason,'')) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'CONFIRMATION_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO settings FROM beauty.commission_settings WHERE id FOR UPDATE;
 IF action IN('activation','emergency') THEN
  prior:=to_jsonb(settings);
  IF action='activation' THEN
   -- Once active, earned contracts remain effective. Emergency stops new awards only.
   IF payload->>'enabled' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'USE_EMERGENCY_STOP' USING ERRCODE='22023'; END IF;
   UPDATE beauty.commission_settings SET enabled=true,version=version+1,updated_at=now() WHERE id;
  ELSE UPDATE beauty.commission_settings SET new_promotions_enabled=(payload->>'enabled')::boolean,version=version+1,updated_at=now() WHERE id; END IF;
  SELECT to_jsonb(s) INTO prior FROM beauty.commission_settings s WHERE id; -- recorded below with original state separately
  INSERT INTO beauty.financial_admin_audit_logs(actor_user_id,action,target_type,reason,previous_state,new_state)
   VALUES(actor,'commission.'||action,'commission_settings',reason,to_jsonb(settings),prior);
  RETURN jsonb_build_object('saved',true);
 ELSIF NOT settings.enabled THEN RAISE EXCEPTION 'CONTROL_DISABLED' USING ERRCODE='22023';
 ELSIF action='create' THEN
  IF NOT settings.new_promotions_enabled THEN RAISE EXCEPTION 'PROMOTIONS_STOPPED' USING ERRCODE='22023'; END IF;
  bp:=(payload->>'basisPoints')::integer; start_time:=(payload->>'startsAt')::timestamptz; end_time:=(payload->>'endsAt')::timestamptz;
  IF bp IS NULL OR bp NOT BETWEEN 0 AND 5000 OR start_time IS NULL OR start_time<now()+interval '24 hours' OR end_time IS NULL OR end_time<=start_time
   OR coalesce(payload->>'kind','') NOT IN('platform','individual') OR coalesce(payload->>'scope','') NOT IN('all','verified','unverified','starter','pro','premium') THEN RAISE EXCEPTION 'INVALID_COMMISSION_RULE' USING ERRCODE='22023'; END IF;
  target:=(payload->>'professionalId')::uuid;
  IF (payload->>'kind'='platform' AND target IS NOT NULL) OR (payload->>'kind'='individual' AND (target IS NULL OR NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=target))) THEN RAISE EXCEPTION 'INVALID_COMMISSION_RULE' USING ERRCODE='22023'; END IF;
  INSERT INTO beauty.commission_rules(kind,professional_id,scope,basis_points,starts_at,ends_at,reason,created_by)
   VALUES(payload->>'kind',target,payload->>'scope',bp,start_time,end_time,reason,actor) RETURNING * INTO result;
 ELSIF action='cancel' THEN
  SELECT * INTO previous FROM beauty.commission_rules WHERE id=(payload->>'ruleId')::uuid FOR UPDATE;
  IF previous.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF previous.kind IN('founding_trial','founding_reward') THEN RAISE EXCEPTION 'CONTRACTUAL_REWARD_PROTECTED' USING ERRCODE='22023'; END IF;
  start_time:=(payload->>'cancelledFrom')::timestamptz;
  IF start_time IS NULL OR start_time<now()+interval '24 hours' OR previous.cancelled_from IS NOT NULL OR start_time>=previous.ends_at THEN RAISE EXCEPTION 'INVALID_COMMISSION_RULE' USING ERRCODE='22023'; END IF;
  prior:=to_jsonb(previous);
  UPDATE beauty.commission_rules SET cancelled_from=start_time WHERE id=previous.id RETURNING * INTO result;
 ELSIF action='enrol' THEN
  IF NOT settings.new_promotions_enabled THEN RAISE EXCEPTION 'PROMOTIONS_STOPPED' USING ERRCODE='22023'; END IF;
  target:=(payload->>'professionalId')::uuid; start_time:=(payload->>'startsAt')::timestamptz;
  IF target IS NULL OR start_time IS NULL OR start_time<now()+interval '24 hours' OR NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=target) THEN RAISE EXCEPTION 'INVALID_COMMISSION_RULE' USING ERRCODE='22023'; END IF;
  INSERT INTO beauty.commission_rules(kind,professional_id,basis_points,starts_at,ends_at,reason,created_by)
   VALUES('founding_trial',target,0,start_time,start_time+interval '14 days',reason,actor) RETURNING * INTO result;
  INSERT INTO beauty.founding_participants(professional_id,trial_rule_id) VALUES(target,result.id);
 ELSIF action='qualify' THEN
  target:=(payload->>'professionalId')::uuid;
  SELECT * INTO participant FROM beauty.founding_participants WHERE professional_id=target FOR UPDATE;
  IF participant.professional_id IS NULL OR participant.submitted_at IS NULL THEN RAISE EXCEPTION 'QUESTIONNAIRE_REQUIRED' USING ERRCODE='22023'; END IF;
  IF participant.reward_rule_id IS NOT NULL THEN RETURN jsonb_build_object('saved',true,'ruleId',participant.reward_rule_id); END IF;
  SELECT * INTO previous FROM beauty.commission_rules WHERE id=participant.trial_rule_id;
  -- Participation must have happened during the trial. Critical feedback is equally eligible.
  IF NOT EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id WHERE b.professional_id=target AND b.created_at>=previous.starts_at AND b.created_at<previous.ends_at AND p.captured_pence>0)
   AND NOT EXISTS(SELECT 1 FROM beauty.posts p WHERE p.professional_id=target AND p.created_at>=previous.starts_at AND p.created_at<previous.ends_at AND p.publication_status='published' AND p.moderation_status='visible') THEN RAISE EXCEPTION 'PARTICIPATION_REQUIRED' USING ERRCODE='22023'; END IF;
  start_time:=greatest(now(),previous.ends_at);
  INSERT INTO beauty.commission_rules(kind,professional_id,basis_points,starts_at,ends_at,reason,created_by)
   VALUES('founding_reward',target,0,start_time,start_time+interval '30 days',reason,actor) RETURNING * INTO result;
  prior:=to_jsonb(participant);
  UPDATE beauty.founding_participants SET reward_rule_id=result.id,qualified_at=now(),qualified_by=actor WHERE professional_id=target;
 ELSE RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 FOR pro IN SELECT p.id FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE u.status='active' AND (result.professional_id IS NULL OR result.professional_id=p.id) LOOP
  PERFORM beauty.commission_notice(pro.id,result.id,
   CASE WHEN action='cancel' THEN 'Commission promotion ends early from '||result.cancelled_from::text||'.'
   ELSE 'If eligible for '||result.scope||', service commission '||(result.basis_points/100.0)::text||'% from '||result.starts_at::text||' until '||result.ends_at::text||'.' END||
   ' After expiry the then-valid individual/platform or standard rate applies. Customer booking and payment processing fees remain separate. Existing bookings keep agreed terms.',
   CASE WHEN action='cancel' THEN result.cancelled_from ELSE result.starts_at END);
 END LOOP;
 INSERT INTO beauty.financial_admin_audit_logs(actor_user_id,action,target_type,target_id,reason,previous_state,new_state)
  VALUES(actor,'commission.'||action,'commission_rule',result.id,reason,prior,to_jsonb(result));
 RETURN jsonb_build_object('saved',true,'ruleId',result.id);
END $$;

CREATE FUNCTION beauty.my_commission_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; BEGIN
 SELECT p.id INTO target FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id JOIN beauty.user_roles ur ON ur.user_id=u.id AND ur.role='professional' WHERE u.auth_id=beauty.auth_id() AND u.status='active';
 IF target IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('effective',beauty.resolve_service_commission(target),'enabled',(SELECT enabled FROM beauty.commission_settings WHERE id),
 'notices',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM (SELECT body,effective_at,created_at FROM beauty.commission_notices WHERE professional_id=target ORDER BY created_at DESC LIMIT 50)n),'[]'::jsonb),
 'founding',(SELECT to_jsonb(f) FROM beauty.founding_participants f WHERE professional_id=target),
 'bookings',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.agreed_at DESC) FROM (SELECT t.booking_id,t.basis_points,t.commission_pence,t.rule_reference,t.pricing_version,t.agreed_at FROM beauty.booking_commission_terms t WHERE professional_id=target ORDER BY agreed_at DESC LIMIT 100)t),'[]'::jsonb));
END $$;
CREATE FUNCTION beauty.submit_founding_questionnaire(answers jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; trial beauty.commission_rules; BEGIN
 SELECT p.id INTO target FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id JOIN beauty.user_roles ur ON ur.user_id=u.id AND ur.role='professional' WHERE u.auth_id=beauty.auth_id() AND u.status='active';
 SELECT r.* INTO trial FROM beauty.founding_participants f JOIN beauty.commission_rules r ON r.id=f.trial_rule_id WHERE f.professional_id=target;
 IF target IS NULL OR trial.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF now()<trial.starts_at+interval '10 days' OR jsonb_typeof(answers) IS DISTINCT FROM 'object'
  OR length(trim(coalesce(answers->>'experience',''))) NOT BETWEEN 10 AND 2000 OR length(trim(coalesce(answers->>'improve',''))) NOT BETWEEN 10 AND 2000
  OR length(trim(coalesce(answers->>'useAgain',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'INVALID_QUESTIONNAIRE' USING ERRCODE='22023'; END IF;
 UPDATE beauty.founding_participants SET questionnaire=answers,submitted_at=now() WHERE professional_id=target AND submitted_at IS NULL;
END $$;

CREATE FUNCTION beauty.owner_commission_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_owner();
 RETURN jsonb_build_object('asOf',now(),'settings',(SELECT to_jsonb(s) FROM beauty.commission_settings s WHERE id),
 'rules',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY starts_at DESC) FROM beauty.commission_rules r),'[]'::jsonb),
 'professionals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.business_name,''),u.display_name),'effective',beauty.resolve_service_commission(p.id))) FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id),'[]'::jsonb),
 'founding',coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM beauty.founding_participants f),'[]'::jsonb),
 'metrics',(SELECT jsonb_build_object('commissionEarnedPence',coalesce(sum(q.professional_platform_fee_pence) FILTER(WHERE p.captured_pence>0 AND EXISTS(SELECT 1 FROM beauty.financial_ledger_transactions l WHERE l.event_reference='booking-payment:'||p.booking_id::text)),0),
 'waivedPence',coalesce(sum(t.waived_pence) FILTER(WHERE p.captured_pence>0 AND EXISTS(SELECT 1 FROM beauty.financial_ledger_transactions l WHERE l.event_reference='booking-payment:'||p.booking_id::text)),0),'capturedPence',coalesce(sum(p.captured_pence),0),
 'paymentCostsPence',coalesce(sum(c.fee_pence),0),'costsPending',count(*) FILTER(WHERE p.captured_pence>0 AND c.booking_id IS NULL),
 'legacyWithoutTerms',count(*) FILTER(WHERE t.booking_id IS NULL)) FROM beauty.payments p LEFT JOIN beauty.financial_quotes q ON q.booking_id=p.booking_id LEFT JOIN beauty.booking_commission_terms t ON t.booking_id=p.booking_id LEFT JOIN beauty.booking_provider_costs c ON c.booking_id=p.booking_id),
 'performance',coalesce((SELECT jsonb_agg(to_jsonb(stats)) FROM (SELECT t.rule_reference,count(*) FILTER(WHERE p.captured_pence>0) AS paid_bookings,
 coalesce(sum(t.waived_pence) FILTER(WHERE p.captured_pence>0 AND EXISTS(SELECT 1 FROM beauty.financial_ledger_transactions l WHERE l.event_reference='booking-payment:'||p.booking_id::text)),0) AS waived_pence,coalesce(sum(q.professional_platform_fee_pence) FILTER(WHERE p.captured_pence>0 AND EXISTS(SELECT 1 FROM beauty.financial_ledger_transactions l WHERE l.event_reference='booking-payment:'||p.booking_id::text)),0) AS earned_pence,
 coalesce(sum(c.fee_pence),0) AS provider_cost_pence FROM beauty.booking_commission_terms t JOIN beauty.payments p ON p.booking_id=t.booking_id LEFT JOIN beauty.financial_quotes q ON q.booking_id=t.booking_id LEFT JOIN beauty.booking_provider_costs c ON c.booking_id=t.booking_id GROUP BY t.rule_reference)stats),'[]'::jsonb),
 'audit',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT actor_user_id,action,reason,previous_state,new_state,created_at FROM beauty.financial_admin_audit_logs WHERE action LIKE 'commission.%' ORDER BY created_at DESC LIMIT 100)a),'[]'::jsonb));
END $$;

CREATE FUNCTION beauty.reconcile_booking_provider_cost(target uuid,intent text,transaction_ref text,amount integer,fee integer,currency_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE payment beauty.payments; existing beauty.booking_provider_costs; BEGIN
 SELECT * INTO payment FROM beauty.payments WHERE booking_id=target FOR UPDATE;
 IF payment.booking_id IS NULL OR payment.stripe_payment_intent_id IS DISTINCT FROM intent OR payment.captured_pence<>amount OR currency_code IS DISTINCT FROM 'gbp' OR fee IS NULL OR fee<0 OR length(coalesce(transaction_ref,''))<3 THEN RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE='22023'; END IF;
 SELECT * INTO existing FROM beauty.booking_provider_costs WHERE booking_id=target;
 IF existing.booking_id IS NOT NULL THEN
  IF existing.stripe_balance_transaction_id IS DISTINCT FROM transaction_ref OR existing.fee_pence<>fee THEN RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE='22023'; END IF;
  RETURN;
 END IF;
 INSERT INTO beauty.booking_provider_costs(booking_id,stripe_balance_transaction_id,charge_pence,fee_pence) VALUES(target,transaction_ref,amount,fee);
 IF fee>0 THEN PERFORM beauty.record_financial_ledger('booking-provider-cost:'||target,'admin_adjustment','booking',target,(SELECT professional_id FROM beauty.bookings WHERE id=target),
  jsonb_build_object('stripeBalanceTransactionId',transaction_ref),jsonb_build_array(jsonb_build_object('accountCode','provider_cost','amountPence',fee),jsonb_build_object('accountCode','provider_clearing','amountPence',-fee))); END IF;
END $$;
CREATE FUNCTION beauty.pending_booking_provider_costs() RETURNS TABLE(booking_id uuid,intent_id text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.booking_id,p.stripe_payment_intent_id FROM beauty.payments p LEFT JOIN beauty.booking_provider_costs c ON c.booking_id=p.booking_id WHERE p.captured_pence>0 AND p.stripe_payment_intent_id IS NOT NULL AND c.booking_id IS NULL ORDER BY p.updated_at DESC LIMIT 10
$$;
CREATE FUNCTION beauty.claim_commission_notices() RETURNS TABLE(id uuid,email text,body text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH picked AS (SELECT n.id FROM beauty.commission_notices n WHERE n.email_sent_at IS NULL AND n.attempts<10 AND (n.claimed_at IS NULL OR n.claimed_at<now()-interval '15 minutes') ORDER BY n.created_at LIMIT 25 FOR UPDATE SKIP LOCKED),
 claimed AS (UPDATE beauty.commission_notices n SET claimed_at=now(),attempts=attempts+1 FROM picked WHERE n.id=picked.id RETURNING n.*)
 SELECT n.id,u.email,n.body FROM claimed n JOIN beauty.professional_profiles p ON p.id=n.professional_id JOIN beauty.users u ON u.id=p.user_id WHERE u.status='active'
$$;
CREATE FUNCTION beauty.finish_commission_notice(target uuid,provider_id text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE beauty.commission_notices SET email_sent_at=now(),provider_email_id=provider_id WHERE id=target AND length(coalesce(provider_id,''))>0
$$;

-- Worker ownership and narrowly scoped entry points; all routines revoke PUBLIC.
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops,beauty_financial_worker,beauty_payment_worker;
DO $$ DECLARE f record; owner_role text; BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname IN(
 'standard_service_commission','resolve_service_commission','snapshot_booking_commission','snapshot_payment_commission','owner_commission_action','commission_notice','my_commission_overview','submit_founding_questionnaire','owner_commission_overview','reconcile_booking_provider_cost','pending_booking_provider_costs','claim_commission_notices','finish_commission_notice') LOOP
  owner_role:=CASE WHEN f.proname IN('owner_commission_action','commission_notice','owner_commission_overview','submit_founding_questionnaire') THEN 'beauty_admin_ops'
  WHEN f.proname IN('reconcile_booking_provider_cost','pending_booking_provider_costs','claim_commission_notices','finish_commission_notice') THEN 'beauty_payment_worker' ELSE 'beauty_financial_worker' END;
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I',f.oid::regprocedure,owner_role);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,beauty_app',f.oid::regprocedure);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops,beauty_financial_worker,beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.standard_service_commission(uuid),beauty.resolve_service_commission(uuid,timestamptz,boolean) TO beauty_financial_worker,beauty_admin_ops;
GRANT EXECUTE ON FUNCTION beauty.owner_commission_action(jsonb),beauty.owner_commission_overview(),beauty.my_commission_overview(),beauty.submit_founding_questionnaire(jsonb) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.commission_notice(uuid,uuid,text,timestamptz) TO beauty_admin_ops;
GRANT EXECUTE ON FUNCTION beauty.reconcile_booking_provider_cost(uuid,text,text,integer,integer,text),beauty.pending_booking_provider_costs(),beauty.claim_commission_notices(),beauty.finish_commission_notice(uuid,text) TO beauty_payment_worker;
CREATE OR REPLACE FUNCTION beauty.prepare_booking_financial_quote(target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor uuid;
  booking beauty.bookings;
  quote beauty.financial_quotes;
  booking_fee integer:=beauty.public_booking_fee_pence();
  commission_bps integer;
  commission_total integer;
  commission_collected integer;
  plan_key text;
  terms beauty.booking_commission_terms;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  PERFORM pg_advisory_xact_lock(hashtextextended('commission-quote:'||target::text,0));
  SELECT * INTO booking FROM beauty.bookings WHERE id=target;

  IF actor IS NULL
    OR booking.id IS NULL
    OR booking.customer_id<>actor
    OR booking.status<>'payment_pending'
    OR booking.hold_expires_at<=now() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO quote
  FROM beauty.financial_quotes
  WHERE booking_id=target;

  IF quote.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id',quote.id,
      'customerTotalPence',quote.customer_total_pence,
      'customerPlatformFeePence',quote.customer_platform_fee_pence,
      'professionalProceedsPence',quote.professional_proceeds_pence,
      'professionalPlatformFeePence',quote.professional_platform_fee_pence
    );
  END IF;

  SELECT coalesce(s.plan_key,'starter') INTO plan_key
  FROM beauty.professional_profiles p
  LEFT JOIN beauty.professional_subscriptions s
    ON s.professional_id=p.id AND s.status='active'
  WHERE p.id=booking.professional_id;

  plan_key:=coalesce(plan_key,'starter');
  SELECT * INTO terms FROM beauty.booking_commission_terms WHERE booking_id=target;
  IF terms.booking_id IS NULL THEN
    -- Pending legacy reservations have no agreed commission quote yet.
    DECLARE applied jsonb; BEGIN
      applied:=beauty.resolve_service_commission(booking.professional_id);
      commission_bps:=(applied->>'basisPoints')::integer;
      commission_total:=round(booking.price_pence::numeric*commission_bps/10000)::integer;
      IF commission_total>booking.deposit_pence THEN RAISE EXCEPTION 'COMMISSION_EXCEEDS_DEPOSIT' USING ERRCODE='22023'; END IF;
      INSERT INTO beauty.booking_commission_terms(booking_id,professional_id,rule_id,rule_reference,pricing_version,basis_points,standard_basis_points,commission_pence,waived_pence,customer_fee_pence)
      VALUES(booking.id,booking.professional_id,(applied->>'ruleId')::uuid,applied->>'ruleReference',applied->>'pricingVersion',commission_bps,(applied->>'standardBasisPoints')::integer,commission_total,
       greatest(0,round(booking.price_pence::numeric*(applied->>'standardBasisPoints')::integer/10000)::integer-commission_total),booking_fee);
      INSERT INTO beauty.payment_commission_terms(booking_id,rule_reference,rule_id,pricing_version,basis_points,commission_pence)
      SELECT t.booking_id,t.rule_reference,t.rule_id,t.pricing_version,t.basis_points,t.commission_pence FROM beauty.booking_commission_terms t WHERE t.booking_id=booking.id;
    END;
  ELSE
    commission_bps:=terms.basis_points;
    commission_total:=terms.commission_pence;
    booking_fee:=terms.customer_fee_pence;
  END IF;
  commission_collected:=least(
    commission_total,
    booking.deposit_pence
  );

  INSERT INTO beauty.financial_quotes(
    booking_id,fee_rule_id,service_value_pence,payable_now_pence,
    customer_platform_fee_pence,professional_platform_fee_pence,
    estimated_provider_cost_pence,professional_processing_cost_pence,
    customer_total_pence,professional_proceeds_pence,
    platform_gross_revenue_pence,platform_net_revenue_pence,
    pricing_plan_key,professional_commission_basis_points,
    professional_commission_total_pence,
    professional_commission_deferred_pence
  ) VALUES(
    booking.id,NULL,booking.price_pence,booking.deposit_pence,
    booking_fee,commission_collected,
    0,0,
    booking.deposit_pence+booking_fee,
    booking.deposit_pence-commission_collected,
    booking_fee+commission_collected,
    booking_fee+commission_collected,
    plan_key,commission_bps,commission_total,
    commission_total-commission_collected
  )
  RETURNING * INTO quote;

  RETURN jsonb_build_object(
    'id',quote.id,
    'customerTotalPence',quote.customer_total_pence,
    'customerPlatformFeePence',quote.customer_platform_fee_pence,
    'professionalProceedsPence',quote.professional_proceeds_pence,
    'professionalPlatformFeePence',quote.professional_platform_fee_pence
  );
END $$;


CREATE FUNCTION beauty.owner_simulate_commission_rule(target uuid, at_time timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_owner();
 IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=target) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('rule',beauty.resolve_service_commission(target,at_time,true),'fee',beauty.public_booking_fee_pence(), 'verified',coalesce((beauty.professional_access_state(target)->>'verified')::boolean,false));
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_simulate_commission_rule(uuid,timestamptz) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.owner_simulate_commission_rule(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_simulate_commission_rule(uuid,timestamptz) TO beauty_app;
-- Retire the unconfirmed legacy mutation route; preserve its existing agreements.
DO $$ BEGIN
 IF to_regprocedure('beauty.owner_set_professional_commission_override(uuid,integer,text,timestamptz)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION beauty.owner_set_professional_commission_override(uuid,integer,text,timestamptz) FROM PUBLIC,anon,authenticated,beauty_app;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION beauty.professional_service_commission_basis_points(target uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (beauty.resolve_service_commission(target)->>'basisPoints')::integer
$$;
CREATE OR REPLACE FUNCTION beauty.my_professional_pricing() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE target uuid; selected beauty.professional_plan_definitions;
BEGIN
  SELECT p.id INTO target
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  IF target IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT d.* INTO selected
  FROM beauty.professional_plan_definitions d
  LEFT JOIN beauty.professional_subscriptions s
    ON s.professional_id=target
   AND s.status='active'
   AND s.plan_key=d.plan_key
  WHERE d.plan_key=coalesce(
    (SELECT plan_key FROM beauty.professional_subscriptions
      WHERE professional_id=target AND status='active'),
    'starter'
  )
  LIMIT 1;

  RETURN jsonb_build_object(
    'planKey',selected.plan_key,
    'planName',selected.display_name,
    'monthlyPricePence',selected.monthly_price_pence,
    'serviceCommissionBasisPoints',CASE WHEN (SELECT enabled FROM beauty.commission_settings WHERE id) THEN beauty.professional_service_commission_basis_points(target) ELSE selected.service_commission_basis_points END,
    'standardServiceCommissionBasisPoints',beauty.standard_service_commission(target),
    'productCommissionBasisPoints',1000,
    'standardWithdrawalBasisPoints',0,
    'instantWithdrawalBasisPoints',400,
    'customerBookingFeePence',100
  );
END $$;


GRANT EXECUTE ON FUNCTION beauty.public_booking_fee_pence() TO beauty_admin_ops;
GRANT SELECT ON beauty.public_booking_fee TO beauty_admin_ops;

CREATE FUNCTION beauty.notify_new_professional_commission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rule beauty.commission_rules; BEGIN
 FOR rule IN SELECT * FROM beauty.commission_rules WHERE kind='platform' AND ends_at>now() AND (cancelled_from IS NULL OR cancelled_from>now()) LOOP
  PERFORM beauty.commission_notice(NEW.id,rule.id,
   'If eligible for '||rule.scope||', service commission is '||(rule.basis_points/100.0)::text||'% from '||rule.starts_at::text||' until '||rule.ends_at::text||'. After expiry the then-valid individual/platform or standard rate applies. Existing bookings keep their agreed terms. Processing and customer booking fees are separate.',rule.starts_at);
 END LOOP;
 RETURN NEW;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.notify_new_professional_commission() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.notify_new_professional_commission() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER professional_commission_notice AFTER INSERT ON beauty.professional_profiles FOR EACH ROW EXECUTE FUNCTION beauty.notify_new_professional_commission();

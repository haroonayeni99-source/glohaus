-- Preserve every existing participant's original extension eligibility.
ALTER TABLE beauty.founding_participants ADD COLUMN legacy_extension_eligible boolean NOT NULL DEFAULT true;
ALTER TABLE beauty.founding_participants ALTER COLUMN legacy_extension_eligible SET DEFAULT false;
CREATE OR REPLACE FUNCTION beauty.owner_commission_action(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
  IF participant.professional_id IS NOT NULL AND NOT participant.legacy_extension_eligible THEN RAISE EXCEPTION 'FOUNDING_EXTENSION_NOT_AVAILABLE' USING ERRCODE='22023'; END IF;
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


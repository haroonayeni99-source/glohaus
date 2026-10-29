-- Optional feedback for new participants opens when their fourteen-day trial ends.
-- Preserve the timing of previously promised legacy offers.
CREATE OR REPLACE FUNCTION beauty.submit_founding_questionnaire(answers jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; trial beauty.commission_rules; BEGIN
 SELECT p.id INTO target FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id JOIN beauty.user_roles ur ON ur.user_id=u.id AND ur.role='professional' WHERE u.auth_id=beauty.auth_id() AND u.status='active';
 SELECT r.* INTO trial FROM beauty.founding_participants f JOIN beauty.commission_rules r ON r.id=f.trial_rule_id WHERE f.professional_id=target;
 IF target IS NULL OR trial.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF now()<(CASE WHEN (SELECT legacy_extension_eligible FROM beauty.founding_participants WHERE professional_id=target) THEN trial.starts_at+interval '10 days' ELSE trial.ends_at END) OR jsonb_typeof(answers) IS DISTINCT FROM 'object'
  OR length(trim(coalesce(answers->>'experience',''))) NOT BETWEEN 10 AND 2000 OR length(trim(coalesce(answers->>'improve',''))) NOT BETWEEN 10 AND 2000
  OR length(trim(coalesce(answers->>'useAgain',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'INVALID_QUESTIONNAIRE' USING ERRCODE='22023'; END IF;
 UPDATE beauty.founding_participants SET questionnaire=answers,submitted_at=now() WHERE professional_id=target AND submitted_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION beauty.my_commission_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; BEGIN
 SELECT p.id INTO target FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id JOIN beauty.user_roles ur ON ur.user_id=u.id AND ur.role='professional' WHERE u.auth_id=beauty.auth_id() AND u.status='active';
 IF target IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('effective',beauty.resolve_service_commission(target),'enabled',(SELECT enabled FROM beauty.commission_settings WHERE id),
 'notices',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM (SELECT body,effective_at,created_at FROM beauty.commission_notices WHERE professional_id=target ORDER BY created_at DESC LIMIT 50)n),'[]'::jsonb),
 'founding',(SELECT to_jsonb(f)||jsonb_build_object('trial_starts_at',r.starts_at,'trial_ends_at',r.ends_at,'feedback_available',now()>=CASE WHEN f.legacy_extension_eligible THEN r.starts_at+interval '10 days' ELSE r.ends_at END) FROM beauty.founding_participants f JOIN beauty.commission_rules r ON r.id=f.trial_rule_id WHERE f.professional_id=target),
 'bookings',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.agreed_at DESC) FROM (SELECT t.booking_id,t.basis_points,t.commission_pence,t.rule_reference,t.pricing_version,t.agreed_at FROM beauty.booking_commission_terms t WHERE professional_id=target ORDER BY agreed_at DESC LIMIT 100)t),'[]'::jsonb));
END $$;

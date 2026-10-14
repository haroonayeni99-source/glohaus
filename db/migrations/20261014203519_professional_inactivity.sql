-- Inactivity is measured from observed use, not a lack of sales. Existing profiles
-- start a fresh monitoring period; no historical sign-in date is fabricated.
CREATE TABLE beauty.professional_activity (
 professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
 monitored_since timestamptz NOT NULL DEFAULT now(),
 last_activity_at timestamptz NOT NULL DEFAULT now(),
 activity_source text NOT NULL DEFAULT 'monitoring_started' CHECK(activity_source IN('monitoring_started','website_visit','booking')),
 episode_id uuid NOT NULL DEFAULT gen_random_uuid(),
 last_alert_stage integer NOT NULL DEFAULT 0 CHECK(last_alert_stage IN(0,14,30,60)),
 warning_at timestamptz,
 hidden_at timestamptz,
 offer_until timestamptz,
 offer_episode_id uuid,
 boost_until timestamptz
);
CREATE INDEX professional_activity_due ON beauty.professional_activity(last_activity_at,professional_id);
CREATE TABLE beauty.professional_activity_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 episode_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('alert_14','alert_30','alert_60','offer_boost','accept_boost','hide','restore')),
 actor_user_id uuid REFERENCES beauty.users(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX professional_activity_events_recent ON beauty.professional_activity_events(professional_id,created_at DESC);
CREATE UNIQUE INDEX professional_activity_stage_once ON beauty.professional_activity_events(professional_id,episode_id,action) WHERE action IN('alert_14','alert_30','alert_60');
CREATE TABLE beauty.professional_activity_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES beauty.professional_activity_events(id),
 recipient_user_id uuid NOT NULL REFERENCES beauty.users(id),
 audience text NOT NULL CHECK(audience IN('owner','professional')),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 120),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 500),
 href text NOT NULL CHECK(href IN('/admin','/professional')),
 preference_key text CHECK(preference_key IN('professional_growth','professional_promotions')),
 stale_when_active boolean NOT NULL DEFAULT true,
 due_at timestamptz NOT NULL DEFAULT now(),
 claimed_until timestamptz,
 first_attempt_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 sent_at timestamptz,
 cancelled_at timestamptz,
 provider_email_id text,
 UNIQUE(event_id,recipient_user_id)
);
CREATE INDEX professional_activity_outbox_due ON beauty.professional_activity_outbox(due_at) WHERE sent_at IS NULL AND cancelled_at IS NULL;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['professional_activity','professional_activity_events','professional_activity_outbox'] LOOP
  EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON beauty.%I TO beauty_admin_ops',t);
  EXECUTE format('CREATE POLICY activity_operator ON beauty.%I FOR ALL TO beauty_admin_ops USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
GRANT SELECT ON beauty.marketing_preferences TO beauty_admin_ops;
CREATE POLICY activity_preferences_read ON beauty.marketing_preferences FOR SELECT TO beauty_admin_ops USING(true);

-- Preserve all existing notification kinds while admitting the new private notices.
DO $$ DECLARE expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO expression FROM pg_constraint
 WHERE conrelid='beauty.in_app_notifications'::regclass AND conname='in_app_notifications_kind_check';
 IF expression IS NULL THEN RAISE EXCEPTION 'NOTIFICATION_CONSTRAINT_MISSING'; END IF;
 ALTER TABLE beauty.in_app_notifications DROP CONSTRAINT in_app_notifications_kind_check;
 EXECUTE format('ALTER TABLE beauty.in_app_notifications ADD CONSTRAINT in_app_notifications_kind_check CHECK ((%s) OR kind=''professional_activity'')',expression);
END $$;
INSERT INTO beauty.professional_activity(professional_id) SELECT id FROM beauty.professional_profiles;

CREATE FUNCTION beauty.record_my_professional_visit() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;
BEGIN
 SELECT p.id INTO target FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id
 WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL
 AND (u.restricted_until IS NULL OR u.restricted_until<=now())
 AND EXISTS(SELECT 1 FROM beauty.user_roles r WHERE r.user_id=u.id AND r.role='professional');
 IF target IS NULL THEN RETURN; END IF;
 INSERT INTO beauty.professional_activity(professional_id,last_activity_at,activity_source) VALUES(target,now(),'website_visit')
 ON CONFLICT(professional_id) DO UPDATE SET
  last_activity_at=now(),activity_source='website_visit',
  episode_id=CASE WHEN beauty.professional_activity.last_alert_stage>0 OR beauty.professional_activity.last_activity_at<=now()-interval '14 days' THEN gen_random_uuid() ELSE beauty.professional_activity.episode_id END,
  last_alert_stage=0,warning_at=NULL
 WHERE beauty.professional_activity.last_activity_at<=now()-interval '1 hour' OR beauty.professional_activity.activity_source='monitoring_started';
END $$;

-- A genuine confirmed/completed booking also counts; unpaid holds do not.
CREATE FUNCTION beauty.record_professional_booking_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status IN('confirmed','completed') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
  INSERT INTO beauty.professional_activity(professional_id,last_activity_at,activity_source) VALUES(NEW.professional_id,now(),'booking')
  ON CONFLICT(professional_id) DO UPDATE SET last_activity_at=now(),activity_source='booking',
   episode_id=CASE WHEN beauty.professional_activity.last_alert_stage>0 OR beauty.professional_activity.last_activity_at<=now()-interval '14 days' THEN gen_random_uuid() ELSE beauty.professional_activity.episode_id END,
   last_alert_stage=0,warning_at=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER professional_booking_activity AFTER INSERT OR UPDATE OF status ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.record_professional_booking_activity();

CREATE FUNCTION beauty.queue_professional_activity_notice(event uuid,recipient uuid,audience_kind text,title text,copy text,link text,preference text DEFAULT NULL,expire_on_return boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO beauty.professional_activity_outbox(event_id,recipient_user_id,audience,subject,body,href,preference_key,stale_when_active)
 VALUES(event,recipient,audience_kind,title,copy,link,preference,expire_on_return) ON CONFLICT DO NOTHING;
 INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href)
 VALUES(recipient,'professional_activity',title,copy,link);
END $$;

CREATE FUNCTION beauty.run_professional_activity_monitor() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p record; stage integer; event uuid; owner_id uuid; count_alerts integer:=0; copy text; title text;
BEGIN
 -- Cron overlap is harmless and must not emit a stage twice.
 IF NOT pg_try_advisory_xact_lock(481414) THEN RETURN jsonb_build_object('alerts',0); END IF;
 INSERT INTO beauty.professional_activity(professional_id) SELECT id FROM beauty.professional_profiles ON CONFLICT DO NOTHING;
 SELECT u.id INTO owner_id FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id
 WHERE r.role='owner' AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now());
 FOR p IN SELECT a.*,pr.user_id,pr.business_name,pr.publication_status FROM beauty.professional_activity a
 JOIN beauty.professional_profiles pr ON pr.id=a.professional_id JOIN beauty.users u ON u.id=pr.user_id
 WHERE u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())
 AND pr.publication_status<>'hidden' AND a.hidden_at IS NULL AND a.last_activity_at<=now()-interval '14 days'
 AND EXISTS(SELECT 1 FROM beauty.user_roles r WHERE r.user_id=u.id AND r.role='professional')
 AND a.last_alert_stage < CASE WHEN a.last_activity_at<=now()-interval '60 days' THEN 60 WHEN a.last_activity_at<=now()-interval '30 days' THEN 30 ELSE 14 END
 ORDER BY a.last_activity_at,a.professional_id LIMIT 100 FOR UPDATE OF a SKIP LOCKED LOOP
  stage:=CASE WHEN p.last_activity_at<=now()-interval '60 days' THEN 60 WHEN p.last_activity_at<=now()-interval '30 days' THEN 30 ELSE 14 END;
  UPDATE beauty.professional_activity SET last_alert_stage=stage,warning_at=CASE WHEN stage=60 AND p.publication_status='published' THEN now() ELSE warning_at END WHERE professional_id=p.professional_id;
  INSERT INTO beauty.professional_activity_events(professional_id,episode_id,action,reason)
   VALUES(p.professional_id,p.episode_id,'alert_'||stage::text,'Scheduled inactivity review after '||stage::text||' days without observed activity.') RETURNING id INTO event;
  title:=CASE WHEN stage=60 AND p.publication_status<>'published' THEN 'Finish setting up your professional profile' WHEN stage=60 THEN 'Your discovery visibility is under review' ELSE 'Keep your GLOHAUS profile up to date' END;
  copy:=CASE WHEN stage=60 AND p.publication_status<>'published' THEN 'We have not observed professional activity for 60 days. Your draft profile is not shown in discovery. Return to finish your profile and availability, or contact support for help.' WHEN stage=60 THEN 'We have not observed professional activity for 60 days. Your profile may be hidden from discovery after an Owner review, no sooner than seven days from this warning. Return to review your availability. Your account and existing bookings are preserved.' ELSE 'We have not observed professional activity for '||stage::text||' days. Return to update your availability, respond to clients or manage your profile. Having no bookings alone does not make you inactive.' END;
  PERFORM beauty.queue_professional_activity_notice(event,p.user_id,'professional',title,copy,'/professional',CASE WHEN stage=60 AND p.publication_status='published' THEN NULL ELSE 'professional_growth' END,true);
  IF owner_id IS NOT NULL THEN
   PERFORM beauty.queue_professional_activity_notice(event,owner_id,'owner','Professional inactivity: '||stage::text||'-day review',
    left(coalesce(nullif(p.business_name,''),'Professional')||' has reached the '||stage::text||'-day inactivity stage. Review Inactive Professionals in Owner/Admin.'||CASE WHEN stage=30 THEN ' You can offer a seven-day visibility boost.' WHEN stage=60 AND p.publication_status='published' THEN ' A warning has been recorded. Hiding requires your decision after seven days.' ELSE '' END,500),'/admin');
  END IF;
  count_alerts:=count_alerts+1;
 END LOOP;
 RETURN jsonb_build_object('alerts',count_alerts);
END $$;

CREATE FUNCTION beauty.admin_professional_activity(search text DEFAULT '',page_number integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; total integer;
BEGIN
 PERFORM beauty.require_admin();
 IF search IS NULL OR length(search)>100 OR page_number IS NULL OR page_number NOT BETWEEN 0 AND 2000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT count(*)::integer INTO total FROM beauty.professional_activity a JOIN beauty.professional_profiles p ON p.id=a.professional_id
 JOIN beauty.users u ON u.id=p.user_id WHERE u.status='active' AND u.deleted_at IS NULL
 AND (a.last_activity_at<=now()-interval '14 days' OR a.hidden_at IS NOT NULL OR a.offer_until>now() OR a.boost_until>now())
 AND (search='' OR position(lower(search) IN lower(p.business_name))>0 OR p.id::text=search OR p.slug=search);
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO result FROM (
  SELECT p.id,p.business_name,p.slug,p.publication_status,a.last_activity_at,a.activity_source,
   greatest(0,floor(extract(epoch FROM now()-a.last_activity_at)/86400))::integer AS inactive_days,
   a.last_alert_stage AS stage,a.warning_at,a.hidden_at,a.offer_until,a.boost_until,
   coalesce((a.last_activity_at<=now()-interval '60 days' AND a.warning_at<=now()-interval '7 days' AND a.hidden_at IS NULL AND p.publication_status='published'),false) AS can_hide,
   (a.last_activity_at<=now()-interval '30 days' AND a.hidden_at IS NULL AND p.publication_status='published' AND a.offer_episode_id IS DISTINCT FROM a.episode_id AND coalesce(a.offer_until,'epoch')<=now() AND coalesce(a.boost_until,'epoch')<=now()) AS can_offer,
   (SELECT count(*)::integer FROM beauty.bookings b WHERE b.professional_id=p.id AND b.status='confirmed' AND b.ends_at>now()) AS upcoming_bookings
  FROM beauty.professional_activity a JOIN beauty.professional_profiles p ON p.id=a.professional_id JOIN beauty.users u ON u.id=p.user_id
  WHERE u.status='active' AND u.deleted_at IS NULL
  AND (a.last_activity_at<=now()-interval '14 days' OR a.hidden_at IS NOT NULL OR a.offer_until>now() OR a.boost_until>now())
  AND (search='' OR position(lower(search) IN lower(p.business_name))>0 OR p.id::text=search OR p.slug=search)
  ORDER BY (a.hidden_at IS NOT NULL) DESC,a.last_activity_at,p.id LIMIT 50 OFFSET page_number*50
 ) x;
 RETURN jsonb_build_object('asOf',now(),'total',total,'page',page_number,'rows',result,'email',jsonb_build_object(
  'pending',(SELECT count(*) FROM beauty.professional_activity_outbox WHERE sent_at IS NULL AND cancelled_at IS NULL AND attempts<5),
  'accepted',(SELECT count(*) FROM beauty.professional_activity_outbox WHERE sent_at IS NOT NULL),
  'cancelled',(SELECT count(*) FROM beauty.professional_activity_outbox WHERE cancelled_at IS NOT NULL),
  'exhausted',(SELECT count(*) FROM beauty.professional_activity_outbox WHERE sent_at IS NULL AND cancelled_at IS NULL AND attempts>=5)));
END $$;

CREATE FUNCTION beauty.owner_professional_activity_action(target uuid,operation text,decision_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; a beauty.professional_activity; p beauty.professional_profiles; event uuid; copy text;
BEGIN
 actor:=beauty.require_owner();
 IF operation IS NULL OR operation NOT IN('offer_boost','hide','restore') OR decision_reason IS NULL OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM beauty.professional_activity WHERE professional_id=target FOR UPDATE;
 SELECT * INTO p FROM beauty.professional_profiles WHERE id=target;
 IF a.professional_id IS NULL OR NOT EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=p.user_id AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())) THEN RAISE EXCEPTION 'ACTIVITY_CHANGED' USING ERRCODE='P0001'; END IF;
 IF operation='offer_boost' THEN
  IF a.last_activity_at>now()-interval '30 days' OR a.hidden_at IS NOT NULL OR p.publication_status='hidden' OR a.offer_episode_id=a.episode_id OR a.offer_until>now() OR a.boost_until>now() THEN RAISE EXCEPTION 'ACTIVITY_CHANGED' USING ERRCODE='P0001'; END IF;
  UPDATE beauty.professional_activity SET offer_until=now()+interval '14 days',offer_episode_id=episode_id WHERE professional_id=target;
  copy:='GLOHAUS has offered you a free seven-day discovery visibility boost. Return within 14 days, review your availability and accept it from your professional dashboard. This does not change your fees or guarantee bookings.';
 ELSIF operation='hide' THEN
  IF a.last_activity_at>now()-interval '60 days' OR a.hidden_at IS NOT NULL OR p.publication_status='hidden' THEN RAISE EXCEPTION 'ACTIVITY_CHANGED' USING ERRCODE='P0001'; END IF;
  IF a.warning_at IS NULL OR a.warning_at>now()-interval '7 days' THEN RAISE EXCEPTION 'WARNING_REQUIRED' USING ERRCODE='P0001'; END IF;
  UPDATE beauty.professional_activity SET hidden_at=now(),offer_until=NULL,boost_until=NULL WHERE professional_id=target;
  copy:='After inactivity reminders and an Owner review, your profile has been hidden from discovery. Your account, direct profile link, existing bookings and earnings remain available. Contact support to request restoration.';
 ELSE
  IF a.hidden_at IS NULL THEN RAISE EXCEPTION 'ACTIVITY_CHANGED' USING ERRCODE='P0001'; END IF;
  UPDATE beauty.professional_activity SET hidden_at=NULL WHERE professional_id=target;
  copy:='An Owner has restored your discovery visibility. Your profile must still meet the usual publication and account requirements. Review your availability and messages to stay up to date.';
 END IF;
 INSERT INTO beauty.professional_activity_events(professional_id,episode_id,action,actor_user_id,reason) VALUES(target,a.episode_id,operation,actor,trim(decision_reason)) RETURNING id INTO event;
 PERFORM beauty.queue_professional_activity_notice(event,p.user_id,'professional',CASE WHEN operation='offer_boost' THEN 'Your seven-day visibility boost offer' ELSE 'Your discovery visibility has changed' END,copy,'/professional',CASE WHEN operation='offer_boost' THEN 'professional_promotions' ELSE NULL END,false);
 PERFORM beauty.write_admin_audit(actor,'owner','professional_activity_'||operation,p.user_id,'professional',target,decision_reason,jsonb_build_object('episodeId',a.episode_id,'lastActivityAt',a.last_activity_at));
END $$;

CREATE FUNCTION beauty.my_professional_activity() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; a beauty.professional_activity; eligible boolean;
BEGIN
 SELECT p.id INTO target FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now()) AND EXISTS(SELECT 1 FROM beauty.user_roles r WHERE r.user_id=u.id AND r.role='professional');
 IF target IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM beauty.professional_activity WHERE professional_id=target;
 eligible:=EXISTS(SELECT 1 FROM beauty.public_professionals p WHERE p.id=target AND p.verification_status<>'restricted') AND EXISTS(SELECT 1 FROM beauty.services s WHERE s.professional_id=target AND s.active);
 RETURN jsonb_build_object('hidden',a.hidden_at IS NOT NULL,'offerUntil',CASE WHEN a.offer_until>now() THEN a.offer_until END,'boostUntil',CASE WHEN a.boost_until>now() THEN a.boost_until END,'eligible',eligible);
END $$;

CREATE FUNCTION beauty.accept_my_visibility_boost() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; a beauty.professional_activity; actor uuid;
BEGIN
 SELECT p.id,u.id INTO target,actor FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now()) AND EXISTS(SELECT 1 FROM beauty.user_roles r WHERE r.user_id=u.id AND r.role='professional');
 IF target IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM beauty.professional_activity WHERE professional_id=target FOR UPDATE;
 IF a.professional_id IS NULL OR a.offer_until IS NULL OR a.offer_until<=now() OR a.hidden_at IS NOT NULL OR a.boost_until>now()
 OR NOT EXISTS(SELECT 1 FROM beauty.public_professionals p WHERE p.id=target AND p.verification_status<>'restricted')
 OR NOT EXISTS(SELECT 1 FROM beauty.services s WHERE s.professional_id=target AND s.active) THEN RAISE EXCEPTION 'BOOST_UNAVAILABLE' USING ERRCODE='P0001'; END IF;
 UPDATE beauty.professional_activity SET boost_until=now()+interval '7 days',offer_until=NULL WHERE professional_id=target;
 INSERT INTO beauty.professional_activity_events(professional_id,episode_id,action,actor_user_id,reason) VALUES(target,a.episode_id,'accept_boost',actor,'Professional accepted the Owner-approved seven-day visibility boost.');
END $$;

-- Private monitoring timestamps and reasons are never exposed publicly.
GRANT SELECT(professional_id,hidden_at,boost_until) ON beauty.professional_activity TO beauty_catalog;
CREATE POLICY activity_catalog_read ON beauty.professional_activity FOR SELECT TO beauty_catalog USING(EXISTS(SELECT 1 FROM beauty.public_professionals p WHERE p.id=professional_id));
CREATE VIEW beauty.public_professional_exposure WITH(security_barrier=true) AS
 SELECT p.id AS professional_id,(a.hidden_at IS NOT NULL) AS hidden,coalesce(a.boost_until>now() AND p.verification_status<>'restricted' AND EXISTS(SELECT 1 FROM beauty.public_services svc WHERE svc.professional_id=p.id),false) AS boosted
 FROM beauty.public_professionals p LEFT JOIN beauty.professional_activity a ON a.professional_id=p.id;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_professional_exposure OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_professional_exposure TO beauty_app,beauty_admin_ops;
GRANT SELECT ON beauty.public_professionals TO beauty_admin_ops;
GRANT EXECUTE ON FUNCTION beauty.catalog_user_is_active(uuid) TO beauty_admin_ops;
GRANT SELECT ON beauty.services TO beauty_admin_ops;
CREATE POLICY activity_services_read ON beauty.services FOR SELECT TO beauty_admin_ops USING(true);

CREATE FUNCTION beauty.claim_professional_activity_emails() RETURNS TABLE(id uuid,email text,subject text,body text,href text,unsubscribe_token uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Recheck preferences, suppression, recipient roles and return activity at send time.
 UPDATE beauty.professional_activity_outbox o SET cancelled_at=now(),claimed_until=NULL
 FROM beauty.professional_activity_events e,beauty.professional_activity a,beauty.professional_profiles p,beauty.users u
 WHERE o.event_id=e.id AND e.professional_id=a.professional_id AND p.id=e.professional_id AND u.id=o.recipient_user_id AND o.sent_at IS NULL AND o.cancelled_at IS NULL
 AND (u.status<>'active' OR u.deleted_at IS NOT NULL OR u.restricted_until>now()
  OR (o.audience='owner' AND NOT EXISTS(SELECT 1 FROM beauty.user_roles r WHERE r.user_id=u.id AND r.role='owner'))
  OR (o.audience='professional' AND (u.id<>p.user_id OR NOT EXISTS(SELECT 1 FROM beauty.user_roles r WHERE r.user_id=u.id AND r.role='professional')))
  OR NOT EXISTS(SELECT 1 FROM beauty.users professional_user WHERE professional_user.id=p.user_id AND professional_user.status='active' AND professional_user.deleted_at IS NULL AND (professional_user.restricted_until IS NULL OR professional_user.restricted_until<=now()))
  OR (o.stale_when_active AND (a.episode_id<>e.episode_id OR a.last_activity_at>now()-interval '14 days' OR a.hidden_at IS NOT NULL OR p.publication_status='hidden'))
  OR (e.action='offer_boost' AND (a.offer_until IS NULL OR a.offer_until<=now()))
  OR EXISTS(SELECT 1 FROM beauty.email_suppressions s WHERE lower(s.email)=lower(u.email))
  OR (o.preference_key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.marketing_preferences mp WHERE mp.user_id=u.id AND CASE o.preference_key WHEN 'professional_growth' THEN mp.professional_growth WHEN 'professional_promotions' THEN mp.professional_promotions ELSE false END)));
 UPDATE beauty.professional_activity_outbox SET attempts=5 WHERE sent_at IS NULL AND cancelled_at IS NULL AND first_attempt_at<=now()-interval '23 hours' AND (claimed_until IS NULL OR claimed_until<=now());
 RETURN QUERY WITH eligible AS (
  SELECT o.id FROM beauty.professional_activity_outbox o
  WHERE o.sent_at IS NULL AND o.cancelled_at IS NULL AND o.due_at<=now() AND (o.claimed_until IS NULL OR o.claimed_until<now()) AND o.attempts<5 AND (o.first_attempt_at IS NULL OR o.first_attempt_at>now()-interval '23 hours')
  ORDER BY o.due_at,o.id LIMIT 10 FOR UPDATE OF o SKIP LOCKED
 ), claimed AS (
  UPDATE beauty.professional_activity_outbox o SET claimed_until=now()+interval '5 minutes',first_attempt_at=coalesce(o.first_attempt_at,now()),attempts=o.attempts+1 FROM eligible WHERE o.id=eligible.id RETURNING o.*
 ) SELECT c.id,u.email,c.subject,c.body,c.href,CASE WHEN c.preference_key IS NOT NULL THEN mp.unsubscribe_token END
 FROM claimed c JOIN beauty.users u ON u.id=c.recipient_user_id LEFT JOIN beauty.marketing_preferences mp ON mp.user_id=u.id;
END $$;
CREATE FUNCTION beauty.finish_professional_activity_email(target uuid,provider_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE beauty.professional_activity_outbox SET sent_at=CASE WHEN provider_id IS NOT NULL THEN now() ELSE sent_at END,provider_email_id=provider_id,claimed_until=NULL,due_at=CASE WHEN provider_id IS NULL THEN now()+interval '15 minutes' ELSE due_at END WHERE id=target AND sent_at IS NULL AND cancelled_at IS NULL;
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.record_my_professional_visit() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.record_professional_booking_activity() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.queue_professional_activity_notice(uuid,uuid,text,text,text,text,text,boolean) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.run_professional_activity_monitor() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_professional_activity(text,integer) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_professional_activity_action(uuid,text,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.my_professional_activity() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.accept_my_visibility_boost() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.claim_professional_activity_emails() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.finish_professional_activity_email(uuid,text) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.record_my_professional_visit(),beauty.record_professional_booking_activity(),beauty.queue_professional_activity_notice(uuid,uuid,text,text,text,text,text,boolean),beauty.run_professional_activity_monitor(),beauty.admin_professional_activity(text,integer),beauty.owner_professional_activity_action(uuid,text,text),beauty.my_professional_activity(),beauty.accept_my_visibility_boost(),beauty.claim_professional_activity_emails(),beauty.finish_professional_activity_email(uuid,text) FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.record_my_professional_visit(),beauty.admin_professional_activity(text,integer),beauty.owner_professional_activity_action(uuid,text,text),beauty.my_professional_activity(),beauty.accept_my_visibility_boost() TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.run_professional_activity_monitor(),beauty.claim_professional_activity_emails(),beauty.finish_professional_activity_email(uuid,text) TO beauty_payment_worker;

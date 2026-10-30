-- Owner-only in-app expiry alerts. No commission, payment or reward mutation.
CREATE INDEX founding_expiry_window ON beauty.commission_rules(ends_at) WHERE kind IN('founding_trial','founding_reward');
CREATE TABLE beauty.founding_expiry_alerts (
 rule_id uuid NOT NULL REFERENCES beauty.commission_rules(id),
 owner_user_id uuid NOT NULL REFERENCES beauty.users(id),
 stage text NOT NULL CHECK(stage IN('ending','ended')),
 ends_at timestamptz NOT NULL,
 notified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(rule_id,owner_user_id,stage)
);
ALTER TABLE beauty.founding_expiry_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.founding_expiry_alerts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.founding_expiry_alerts FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT ON beauty.founding_expiry_alerts TO beauty_admin_ops;
CREATE POLICY founding_alert_ops ON beauty.founding_expiry_alerts TO beauty_admin_ops USING(true) WITH CHECK(true);

DO $$ DECLARE expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO expression FROM pg_constraint
 WHERE conrelid='beauty.in_app_notifications'::regclass AND conname='in_app_notifications_kind_check';
 IF expression IS NULL THEN RAISE EXCEPTION 'NOTIFICATION_KIND_CONSTRAINT_MISSING'; END IF;
 ALTER TABLE beauty.in_app_notifications DROP CONSTRAINT in_app_notifications_kind_check;
 EXECUTE format('ALTER TABLE beauty.in_app_notifications ADD CONSTRAINT in_app_notifications_kind_check CHECK ((%s) OR kind=''founding_expiry'')',expression);
END $$;

CREATE FUNCTION beauty.run_founding_expiry_monitor() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE promotion record; recipient record; new_alert boolean; alerts integer:=0;
 phase text; title text; copy text; label text;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('founding-expiry-monitor',0)) THEN
  RETURN jsonb_build_object('alerts',0);
 END IF;
 FOR promotion IN
  SELECT r.id,r.kind,r.ends_at,coalesce(nullif(p.business_name,''),u.display_name) AS professional_name
  FROM beauty.commission_rules r JOIN beauty.professional_profiles p ON p.id=r.professional_id
  JOIN beauty.users u ON u.id=p.user_id
  WHERE r.kind IN('founding_trial','founding_reward') AND r.starts_at<=now()
   AND r.ends_at<=now()+interval '24 hours' AND r.ends_at>=now()-interval '7 days'
   AND u.deleted_at IS NULL
 LOOP
  phase:=CASE WHEN promotion.ends_at>now() THEN 'ending' ELSE 'ended' END;
  label:=CASE WHEN promotion.kind='founding_reward' THEN 'Legacy Founding extension' ELSE 'Founding trial' END;
  title:=label||CASE WHEN phase='ending' THEN ' ends soon' ELSE ' ended' END;
  copy:=left(promotion.professional_name,120)||': '||label||CASE WHEN phase='ending' THEN ' ends ' ELSE ' ended ' END||
   to_char(promotion.ends_at AT TIME ZONE 'Europe/London','DD Mon YYYY HH24:MI')||' (London time). '||
   'Review the applicable commission and any protected extension in the commission controls. Existing bookings keep their accepted terms.';
  FOR recipient IN SELECT u.id FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='owner'
   WHERE u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())
  LOOP
   new_alert:=NULL;
   INSERT INTO beauty.founding_expiry_alerts(rule_id,owner_user_id,stage,ends_at)
   VALUES(promotion.id,recipient.id,phase,promotion.ends_at)
   ON CONFLICT DO NOTHING RETURNING true INTO new_alert;
   IF new_alert THEN
    INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href)
    VALUES(recipient.id,'founding_expiry',title,copy,'/admin');
    alerts:=alerts+1;
   END IF;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('alerts',alerts);
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.run_founding_expiry_monitor() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.run_founding_expiry_monitor() FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.run_founding_expiry_monitor() TO beauty_payment_worker;

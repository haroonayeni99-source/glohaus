-- Owner controls are additive. There is no self-service path to create an
-- owner, administrator or staff account; the initial owner is provisioned by
-- the separate audited operator script after a real account exists.

DO $$
BEGIN
  IF (SELECT count(*) FROM beauty.user_roles WHERE role = 'owner') > 1 THEN
    RAISE EXCEPTION 'OWNER_ROLE_INTEGRITY_ERROR';
  END IF;
END $$;
CREATE UNIQUE INDEX user_roles_one_owner ON beauty.user_roles(role) WHERE role = 'owner';

ALTER TABLE beauty.admin_audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES beauty.users(id),
  ADD COLUMN IF NOT EXISTS actor_role text CHECK(actor_role IN ('owner','admin','staff')),
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX admin_audit_logs_recent ON beauty.admin_audit_logs(created_at DESC,id DESC);
GRANT INSERT(actor_user_id,actor_role,target_type,target_id,metadata) ON beauty.admin_audit_logs TO beauty_admin_ops;
GRANT SELECT ON beauty.admin_audit_logs TO beauty_admin_ops;
CREATE POLICY admin_audit_operator_read ON beauty.admin_audit_logs FOR SELECT TO beauty_admin_ops USING(true);

CREATE TABLE beauty.staff_permissions (
  user_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK(permission IN (
    'users.read','users.manage','professionals.read','professionals.manage',
    'bookings.read','reports.manage','content.moderate','reviews.moderate',
    'verification.manage','analytics.read','notifications.read'
  )),
  granted_by_user_id uuid NOT NULL REFERENCES beauty.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,permission)
);
ALTER TABLE beauty.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.staff_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_permissions_operator ON beauty.staff_permissions FOR ALL TO beauty_admin_ops USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,DELETE ON beauty.staff_permissions TO beauty_admin_ops;

CREATE TABLE beauty.safety_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES beauty.users(id),
  target_type text NOT NULL CHECK(target_type IN ('user','professional','post','media','review','booking')),
  target_id uuid NOT NULL,
  category text NOT NULL CHECK(length(category) BETWEEN 2 AND 80),
  description text NOT NULL CHECK(length(description) BETWEEN 5 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','under_review','resolved','dismissed')),
  assigned_to_user_id uuid REFERENCES beauty.users(id),
  resolution_reason text CHECK(resolution_reason IS NULL OR length(resolution_reason) BETWEEN 5 AND 500),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((status IN ('resolved','dismissed')) = (resolved_at IS NOT NULL))
);
CREATE INDEX safety_reports_queue ON beauty.safety_reports(status,created_at DESC,id DESC);
CREATE INDEX safety_reports_target ON beauty.safety_reports(target_type,target_id,created_at DESC);
CREATE UNIQUE INDEX safety_reports_open_unique ON beauty.safety_reports(reporter_user_id,target_type,target_id) WHERE status IN ('open','under_review');
ALTER TABLE beauty.safety_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.safety_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY safety_reports_reporter_read ON beauty.safety_reports FOR SELECT TO beauty_app
  USING(EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=reporter_user_id AND u.auth_id=beauty.auth_id() AND u.status='active'));
CREATE POLICY safety_reports_operator ON beauty.safety_reports FOR ALL TO beauty_admin_ops USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE(status,assigned_to_user_id,resolution_reason,resolved_at,updated_at) ON beauty.safety_reports TO beauty_admin_ops;
GRANT SELECT ON beauty.safety_reports TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.write_admin_audit(
  actor uuid,
  actor_kind text,
  event_action text,
  subject_user uuid,
  subject_type text,
  subject_id uuid,
  decision_reason text,
  event_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  INSERT INTO beauty.admin_audit_logs(
    actor_reference,actor_user_id,actor_role,action,target_user_id,target_type,target_id,reason,metadata
  ) VALUES(
    actor::text,actor,actor_kind,event_action,subject_user,subject_type,subject_id,trim(decision_reason),coalesce(event_metadata,'{}'::jsonb)
  );
END $$;

CREATE FUNCTION beauty.owner_set_privileged_role(target uuid,next_role text,enabled boolean,decision_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
  actor:=beauty.require_owner();
  IF next_role NOT IN ('staff','admin') OR enabled IS NULL OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  IF target=actor OR EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=target AND role='owner') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM beauty.users WHERE id=target AND status='active') THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';
  END IF;
  IF enabled THEN
    INSERT INTO beauty.user_roles(user_id,role) VALUES(target,next_role) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM beauty.user_roles WHERE user_id=target AND role=next_role;
    IF next_role='staff' THEN DELETE FROM beauty.staff_permissions WHERE user_id=target; END IF;
  END IF;
  PERFORM beauty.write_admin_audit(actor,'owner','privileged_role.'||next_role||CASE WHEN enabled THEN '.granted' ELSE '.revoked' END,target,'user',target,decision_reason,jsonb_build_object('role',next_role,'enabled',enabled));
END $$;

CREATE FUNCTION beauty.owner_set_staff_permissions(target uuid,next_permissions text[],decision_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
  actor:=beauty.require_owner();
  IF length(trim(decision_reason)) NOT BETWEEN 5 AND 500 OR next_permissions IS NULL THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=target AND role='staff') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(next_permissions) permission WHERE permission NOT IN (
    'users.read','users.manage','professionals.read','professionals.manage',
    'bookings.read','reports.manage','content.moderate','reviews.moderate',
    'verification.manage','analytics.read','notifications.read'
  )) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  DELETE FROM beauty.staff_permissions WHERE user_id=target;
  INSERT INTO beauty.staff_permissions(user_id,permission,granted_by_user_id)
    SELECT target,permission,actor FROM unnest(next_permissions) permission ON CONFLICT DO NOTHING;
  PERFORM beauty.write_admin_audit(actor,'owner','staff_permissions.changed',target,'user',target,decision_reason,jsonb_build_object('permissions',next_permissions));
END $$;

CREATE FUNCTION beauty.owner_staff_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM beauty.require_owner();
  RETURN jsonb_build_object(
    'staff',(
      SELECT coalesce(jsonb_agg(row_data),'[]'::jsonb) FROM (
        SELECT u.id,u.display_name,u.email,u.status,u.created_at,
          coalesce(array_agg(DISTINCT r.role) FILTER(WHERE r.role IN ('staff','admin')),ARRAY[]::text[]) roles,
          coalesce(array_agg(DISTINCT p.permission) FILTER(WHERE p.permission IS NOT NULL),ARRAY[]::text[]) permissions
        FROM beauty.users u
        JOIN beauty.user_roles r ON r.user_id=u.id AND r.role IN ('staff','admin')
        LEFT JOIN beauty.staff_permissions p ON p.user_id=u.id
        GROUP BY u.id,u.display_name,u.email,u.status,u.created_at
        ORDER BY u.created_at DESC,u.id LIMIT 100
      ) row_data
    ),
    'audit',(
      SELECT coalesce(jsonb_agg(row_data),'[]'::jsonb) FROM (
        SELECT id,actor_user_id,actor_role,action,target_type,target_id,reason,metadata,created_at
        FROM beauty.admin_audit_logs ORDER BY created_at DESC,id DESC LIMIT 100
      ) row_data
    )
  );
END $$;

CREATE FUNCTION beauty.submit_safety_report(next_target_type text,next_target_id uuid,next_category text,next_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; result_id uuid;
BEGIN
  SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';
  IF actor IS NULL OR next_target_type NOT IN ('user','professional','post','media','review','booking') OR next_target_id IS NULL OR length(trim(next_category)) NOT BETWEEN 2 AND 80 OR length(trim(next_description)) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  INSERT INTO beauty.safety_reports(reporter_user_id,target_type,target_id,category,description)
    VALUES(actor,next_target_type,next_target_id,trim(next_category),trim(next_description))
    RETURNING id INTO result_id;
  RETURN result_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'REPORT_ALREADY_OPEN' USING ERRCODE='22023';
END $$;

CREATE FUNCTION beauty.admin_safety_report_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM beauty.require_admin();
  RETURN jsonb_build_object(
    'counts',(SELECT jsonb_build_object('open',count(*) FILTER(WHERE status='open'),'underReview',count(*) FILTER(WHERE status='under_review'),'resolved',count(*) FILTER(WHERE status='resolved'),'dismissed',count(*) FILTER(WHERE status='dismissed')) FROM beauty.safety_reports),
    'reports',(SELECT coalesce(jsonb_agg(row_data),'[]'::jsonb) FROM (
      SELECT r.id,r.target_type,r.target_id,r.category,r.description,r.status,r.created_at,r.updated_at,u.display_name reporter_name
      FROM beauty.safety_reports r JOIN beauty.users u ON u.id=r.reporter_user_id
      ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'under_review' THEN 1 ELSE 2 END,r.created_at DESC,r.id DESC LIMIT 100
    ) row_data)
  );
END $$;

CREATE FUNCTION beauty.admin_resolve_safety_report(target uuid,next_status text,decision_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; report_row beauty.safety_reports;
BEGIN
  actor:=beauty.require_admin();
  IF next_status NOT IN ('under_review','resolved','dismissed') OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  SELECT * INTO report_row FROM beauty.safety_reports WHERE id=target FOR UPDATE;
  IF report_row.id IS NULL OR report_row.status IN ('resolved','dismissed') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  UPDATE beauty.safety_reports SET status=next_status,assigned_to_user_id=actor,resolution_reason=trim(decision_reason),resolved_at=CASE WHEN next_status IN ('resolved','dismissed') THEN now() ELSE NULL END,updated_at=now() WHERE id=target;
  PERFORM beauty.write_admin_audit(actor,'admin','safety_report.'||next_status,report_row.reporter_user_id,'safety_report',target,decision_reason,jsonb_build_object('targetType',report_row.target_type,'targetId',report_row.target_id));
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.write_admin_audit(uuid,text,text,uuid,text,uuid,text,jsonb) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_set_privileged_role(uuid,text,boolean,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_set_staff_permissions(uuid,text[],text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_staff_overview() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.submit_safety_report(text,uuid,text,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_safety_report_overview() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_resolve_safety_report(uuid,text,text) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.write_admin_audit(uuid,text,text,uuid,text,uuid,text,jsonb),beauty.owner_set_privileged_role(uuid,text,boolean,text),beauty.owner_set_staff_permissions(uuid,text[],text),beauty.owner_staff_overview(),beauty.submit_safety_report(text,uuid,text,text),beauty.admin_safety_report_overview(),beauty.admin_resolve_safety_report(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.owner_set_privileged_role(uuid,text,boolean,text),beauty.owner_set_staff_permissions(uuid,text[],text),beauty.owner_staff_overview(),beauty.submit_safety_report(text,uuid,text,text),beauty.admin_safety_report_overview(),beauty.admin_resolve_safety_report(uuid,text,text) TO beauty_app;

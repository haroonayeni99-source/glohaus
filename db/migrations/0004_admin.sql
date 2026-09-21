-- Admin operations use narrowly scoped, audited functions; the web login is never a member of this role.
CREATE ROLE beauty_admin_ops NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA beauty TO beauty_admin_ops;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_admin_ops;
GRANT SELECT ON beauty.users,beauty.user_roles,beauty.professional_profiles,beauty.posts TO beauty_admin_ops;
GRANT UPDATE(status) ON beauty.users TO beauty_admin_ops;
GRANT UPDATE(moderation_status) ON beauty.posts TO beauty_admin_ops;
GRANT INSERT(actor_reference,action,target_user_id,reason) ON beauty.admin_audit_logs TO beauty_admin_ops;
CREATE POLICY admin_users_read ON beauty.users FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY admin_roles_read ON beauty.user_roles FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY admin_profiles_read ON beauty.professional_profiles FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY admin_posts_read ON beauty.posts FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY admin_users_update ON beauty.users FOR UPDATE TO beauty_admin_ops USING(true) WITH CHECK(true);
CREATE POLICY admin_posts_update ON beauty.posts FOR UPDATE TO beauty_admin_ops USING(true) WITH CHECK(true);
CREATE POLICY admin_audit_insert ON beauty.admin_audit_logs FOR INSERT TO beauty_admin_ops WITH CHECK(true);
CREATE FUNCTION beauty.require_admin() RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 SELECT u.id INTO actor FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id
 WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND r.role='admin';
 IF actor IS NULL OR current_setting('app.admin_verified',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION beauty.admin_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_admin();
 RETURN jsonb_build_object(
 'counts',(SELECT jsonb_build_object('users',count(*),'active',count(*) FILTER(WHERE status='active'),'suspended',count(*) FILTER(WHERE status='suspended')) FROM beauty.users),
 'professionals',(SELECT count(*) FROM beauty.professional_profiles),
 'users',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT u.id,u.display_name,u.email,u.status,u.created_at,coalesce((SELECT array_agg(r.role ORDER BY r.role) FROM beauty.user_roles r WHERE r.user_id=u.id),ARRAY[]::text[]) AS roles FROM beauty.users u ORDER BY u.created_at DESC,u.id LIMIT 100) x),
 'posts',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT p.id,p.title,p.body,p.moderation_status,pro.business_name FROM beauty.posts p JOIN beauty.professional_profiles pro ON pro.id=p.professional_id ORDER BY p.created_at DESC,p.id LIMIT 100) x)
 );
END $$;
CREATE FUNCTION beauty.admin_set_user_status(target uuid,next_status text,decision_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=beauty.require_admin();
 IF next_status NOT IN ('active','suspended','removed') OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 -- Admin accounts require an operator procedure to avoid lockout or peer privilege abuse.
 IF EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=target AND role='admin') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 UPDATE beauty.users SET status=next_status WHERE id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,reason) VALUES(actor::text,'account.status.'||next_status,target,trim(decision_reason));
END $$;
CREATE FUNCTION beauty.admin_moderate_post(target uuid,next_status text,decision_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; target_user uuid;
BEGIN
 actor:=beauty.require_admin();
 IF next_status NOT IN ('visible','hidden') OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT pro.user_id INTO target_user FROM beauty.posts p JOIN beauty.professional_profiles pro ON pro.id=p.professional_id WHERE p.id=target;
 IF target_user IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 UPDATE beauty.posts SET moderation_status=next_status WHERE id=target;
 INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,reason) VALUES(actor::text,'post.'||target::text||'.'||next_status,target_user,trim(decision_reason));
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.require_admin() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_overview() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_set_user_status(uuid,text,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_moderate_post(uuid,text,text) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.require_admin(),beauty.admin_overview(),beauty.admin_set_user_status(uuid,text,text),beauty.admin_moderate_post(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_overview(),beauty.admin_set_user_status(uuid,text,text),beauty.admin_moderate_post(uuid,text,text) TO beauty_app;

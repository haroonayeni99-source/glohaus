-- Forward-only repair for account fields already consumed by the server.
-- No new login, operator membership, or application UPDATE privilege is added.
ALTER TABLE beauty.users
  ADD COLUMN restricted_until timestamptz,
  ADD COLUMN restriction_reason text CHECK (restriction_reason IS NULL OR length(trim(restriction_reason)) BETWEEN 5 AND 500),
  ADD COLUMN deleted_at timestamptz;

GRANT UPDATE(restricted_until,restriction_reason,deleted_at,email,display_name)
  ON beauty.users TO beauty_admin_ops;

CREATE FUNCTION beauty.owner_set_user_restriction(target uuid,until_time timestamptz,decision_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
  actor:=beauty.require_owner();
  IF decision_reason IS NULL OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500
    OR (until_time IS NOT NULL AND (until_time<=now() OR until_time>now()+interval '30 days')) THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM beauty.users WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=target AND role='owner')
    OR EXISTS(SELECT 1 FROM beauty.users WHERE id=target AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  UPDATE beauty.users SET restricted_until=until_time,
    restriction_reason=CASE WHEN until_time IS NULL THEN NULL ELSE trim(decision_reason) END
    WHERE id=target;
  PERFORM beauty.write_admin_audit(actor,'owner','account.restriction.changed',target,'user',target,
    decision_reason,jsonb_build_object('restrictedUntil',until_time));
END $$;

CREATE FUNCTION beauty.owner_mark_user_deleted(target uuid,decision_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
  actor:=beauty.require_owner();
  IF decision_reason IS NULL OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM beauty.users WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=target AND role='owner') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  UPDATE beauty.users SET status='removed',deleted_at=coalesce(deleted_at,now()),
    email='deleted-'||id::text||'@removed.invalid',display_name='Deleted account',
    restricted_until=NULL,restriction_reason=NULL WHERE id=target AND deleted_at IS NULL;
  IF FOUND THEN
    PERFORM beauty.write_admin_audit(actor,'owner','account.deleted',target,'user',target,
      decision_reason,'{}'::jsonb);
  END IF;
END $$;

CREATE FUNCTION beauty.admin_user_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM beauty.require_admin();
  RETURN (SELECT coalesce(jsonb_agg(row_data),'[]'::jsonb) FROM (
    SELECT u.id,u.display_name,u.email,u.status,u.restricted_until::text,
      u.restriction_reason,u.deleted_at::text,
      ARRAY(SELECT r.role FROM beauty.user_roles r WHERE r.user_id=u.id ORDER BY r.role) AS roles
    FROM beauty.users u ORDER BY u.created_at DESC,u.id LIMIT 100
  ) row_data);
END $$;

CREATE FUNCTION beauty.owner_account_auth_id(target uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_auth text;
BEGIN
  PERFORM beauty.require_owner();
  SELECT u.auth_id INTO target_auth FROM beauty.users u
  WHERE u.id=target AND u.deleted_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM beauty.user_roles r WHERE r.user_id=u.id AND r.role='owner');
  IF target_auth IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN target_auth;
END $$;

-- Ownership transfer needs schema CREATE only for the migration operation.
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_set_user_restriction(uuid,timestamptz,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_mark_user_deleted(uuid,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_user_overview() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_account_auth_id(uuid) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.owner_set_user_restriction(uuid,timestamptz,text),
  beauty.owner_mark_user_deleted(uuid,text),beauty.admin_user_overview(),beauty.owner_account_auth_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.owner_set_user_restriction(uuid,timestamptz,text),
  beauty.owner_mark_user_deleted(uuid,text),beauty.admin_user_overview(),beauty.owner_account_auth_id(uuid) TO beauty_app;

-- Existing RPC grants/owners are preserved by CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.glohaus_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  target_auth uuid;
  target_user beauty.users;
BEGIN
  target_auth:=auth.uid();
  IF target_auth IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  SELECT * INTO target_user
  FROM beauty.users
  WHERE auth_id=target_auth::text;

  IF target_user.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',target_user.id,
    'authId',target_user.auth_id,
    'email',target_user.email,
    'displayName',target_user.display_name,
    'status',target_user.status,
    'restrictedUntil',target_user.restricted_until,
    'deletedAt',target_user.deleted_at,
    'roles',coalesce((
      SELECT jsonb_agg(r.role ORDER BY r.role)
      FROM beauty.user_roles r
      WHERE r.user_id=target_user.id
    ),'[]'::jsonb),
    'professionalId',(
      SELECT p.id
      FROM beauty.professional_profiles p
      WHERE p.user_id=target_user.id
      LIMIT 1
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.glohaus_enrol_self(
  next_role text,
  adult_confirmed boolean DEFAULT false,
  professional_terms_accepted boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  target_auth uuid;
  auth_email text;
  target_user beauty.users;
  safe_display_name text;
BEGIN
  target_auth:=auth.uid();
  IF target_auth IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  IF next_role NOT IN ('customer','professional') THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  IF next_role='professional'
     AND (adult_confirmed IS DISTINCT FROM true
          OR professional_terms_accepted IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT email INTO auth_email
  FROM auth.users
  WHERE id=target_auth
    AND email IS NOT NULL
    AND email_confirmed_at IS NOT NULL;

  IF auth_email IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  safe_display_name:=left(split_part(auth_email,'@',1),120);
  IF length(safe_display_name)<1 THEN safe_display_name:='GLOHAUS user'; END IF;

  INSERT INTO beauty.users(auth_id,email,display_name)
  VALUES(target_auth::text,auth_email,safe_display_name)
  ON CONFLICT(auth_id) DO NOTHING;

  SELECT * INTO target_user
  FROM beauty.users
  WHERE auth_id=target_auth::text
  FOR UPDATE;

  IF target_user.id IS NULL OR target_user.status<>'active' OR target_user.deleted_at IS NOT NULL
     OR target_user.restricted_until>now() THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE' USING ERRCODE='42501';
  END IF;

  INSERT INTO beauty.user_roles(user_id,role)
  VALUES(target_user.id,next_role)
  ON CONFLICT DO NOTHING;

  IF next_role='professional' THEN
    INSERT INTO beauty.professional_profiles(user_id)
    VALUES(target_user.id)
    ON CONFLICT(user_id) DO NOTHING;
  ELSE
    INSERT INTO beauty.customer_profiles(user_id)
    VALUES(target_user.id)
    ON CONFLICT(user_id) DO NOTHING;
  END IF;

  RETURN public.glohaus_my_account();
END;
$fn$;

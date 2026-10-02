-- Authenticated account fallback used only when the server runtime database
-- credential is unavailable. These functions derive identity exclusively from
-- auth.uid(); callers cannot select or enrol another user.

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

  IF target_user.id IS NULL OR target_user.status<>'active' THEN
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

REVOKE ALL ON FUNCTION public.glohaus_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.glohaus_enrol_self(text,boolean,boolean) FROM PUBLIC;

DO $grant$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.glohaus_my_account() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.glohaus_enrol_self(text,boolean,boolean) FROM anon';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.glohaus_my_account() TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.glohaus_enrol_self(text,boolean,boolean) TO authenticated';
  END IF;
END;
$grant$;


-- The serverless deployment can have many concurrent function instances. The
-- app pool itself remains capped at one connection per instance.
ALTER ROLE glohaus_runtime CONNECTION LIMIT 20;

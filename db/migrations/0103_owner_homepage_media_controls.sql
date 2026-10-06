-- Owner-controlled homepage model imagery.
-- Public reads expose only the two configured HTTPS image URLs; writes require
-- the Owner role and are recorded in the Owner audit log.

CREATE OR REPLACE FUNCTION beauty.public_homepage_media()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT coalesce(
    (SELECT value FROM beauty.platform_settings WHERE key='homepage_media'),
    '{}'::jsonb
  );
$$;

ALTER FUNCTION beauty.public_homepage_media() OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.public_homepage_media() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.public_homepage_media() TO beauty_app,beauty_catalog;

CREATE OR REPLACE FUNCTION beauty.owner_set_homepage_media(
  desktop_hero text,
  mobile_hero text,
  change_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE actor uuid; next_value jsonb;
BEGIN
  PERFORM beauty.require_owner();

  IF length(trim(coalesce(change_reason,''))) < 5 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  IF desktop_hero IS NOT NULL AND trim(desktop_hero) <> ''
     AND trim(desktop_hero) !~ '^https://' THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  IF mobile_hero IS NOT NULL AND trim(mobile_hero) <> ''
     AND trim(mobile_hero) !~ '^https://' THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id();

  next_value := jsonb_build_object(
    'desktopHero',nullif(trim(coalesce(desktop_hero,'')),''),
    'mobileHero',nullif(trim(coalesce(mobile_hero,'')),'')
  );

  INSERT INTO beauty.platform_settings(key,value,updated_at,updated_by)
  VALUES('homepage_media',next_value,now(),actor)
  ON CONFLICT(key) DO UPDATE
  SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by;

  INSERT INTO beauty.owner_audit_log(
    actor_user_id,actor_role,action,target_type,target_id,reason,metadata
  )
  VALUES(
    actor,'owner','homepage_media_updated','platform_setting',NULL,
    trim(change_reason),next_value
  );

  RETURN next_value;
END;
$$;

ALTER FUNCTION beauty.owner_set_homepage_media(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.owner_set_homepage_media(text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_set_homepage_media(text,text,text)
  TO beauty_app;

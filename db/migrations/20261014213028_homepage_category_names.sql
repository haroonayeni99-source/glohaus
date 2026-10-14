-- Save homepage names and photos together. Older image-only saves retain names.
CREATE OR REPLACE FUNCTION beauty.owner_set_homepage_categories(
  category_images jsonb, category_names jsonb, change_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE actor uuid; device record; slot record; label text; normalized jsonb := '{}'::jsonb; device_names jsonb;
BEGIN
  PERFORM beauty.require_owner();
  IF jsonb_typeof(category_names) IS DISTINCT FROM 'object'
     OR NOT (category_names ?& ARRAY['desktop','mobile']) THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  FOR device IN SELECT key,value FROM jsonb_each(category_names) LOOP
    IF device.key NOT IN ('desktop','mobile')
       OR jsonb_typeof(device.value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
    END IF;
    device_names := '{}'::jsonb;
    FOR slot IN SELECT key,value FROM jsonb_each(device.value) LOOP
      IF NOT (slot.key = ANY(CASE WHEN device.key='desktop'
        THEN ARRAY['hair','nails','barber','waxing','injectables']
        ELSE ARRAY['hair','nails','lashes','skin','makeup'] END))
        OR jsonb_typeof(slot.value) NOT IN ('string','null') THEN
        RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
      END IF;
      IF jsonb_typeof(slot.value)='string' THEN
        label := trim(slot.value #>> '{}');
        IF length(label) NOT BETWEEN 2 AND 60 THEN
          RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
        END IF;
        device_names := device_names || jsonb_build_object(slot.key,label);
      ELSE
        device_names := device_names || jsonb_build_object(slot.key,NULL);
      END IF;
    END LOOP;
    normalized := normalized || jsonb_build_object(device.key,device_names);
  END LOOP;
  -- This validates photos and the audit reason before either setting is saved.
  PERFORM beauty.owner_set_homepage_category_images(category_images,change_reason);
  SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id();
  INSERT INTO beauty.platform_settings(key,value,updated_at,updated_by)
  VALUES('homepage_category_names',normalized,now(),actor)
  ON CONFLICT(key) DO UPDATE
    SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  PERFORM beauty.write_admin_audit(actor,'owner','homepage_category_names_updated',
    actor,'platform_setting',NULL,trim(change_reason),normalized);
  RETURN category_images;
END;
$$;
ALTER FUNCTION beauty.owner_set_homepage_categories(jsonb,jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.owner_set_homepage_categories(jsonb,jsonb,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_set_homepage_categories(jsonb,jsonb,text) TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.public_homepage_media()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object(
    'desktopHero', (SELECT value->'desktopHero' FROM beauty.platform_settings WHERE key='homepage_media'),
    'mobileHero', (SELECT value->'mobileHero' FROM beauty.platform_settings WHERE key='homepage_media'),
    'categoryImages', coalesce((SELECT value FROM beauty.platform_settings WHERE key='homepage_category_media'), '{}'::jsonb),
    'categoryNames', coalesce((SELECT value FROM beauty.platform_settings WHERE key='homepage_category_names'), '{}'::jsonb)
  );
$$;
ALTER FUNCTION beauty.public_homepage_media() OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.public_homepage_media() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.public_homepage_media() TO beauty_app,beauty_catalog;

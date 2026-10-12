-- Category media is a separate setting so existing hero saves cannot erase it.
CREATE OR REPLACE FUNCTION beauty.owner_set_homepage_category_images(
  category_images jsonb, change_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE actor uuid; device record; slot record; image_url text;
BEGIN
  PERFORM beauty.require_owner();
  IF length(trim(coalesce(change_reason,''))) NOT BETWEEN 5 AND 500
     OR jsonb_typeof(category_images) IS DISTINCT FROM 'object'
     OR NOT (category_images ?& ARRAY['desktop','mobile']) THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  FOR device IN SELECT key,value FROM jsonb_each(category_images) LOOP
    IF device.key NOT IN ('desktop','mobile')
       OR jsonb_typeof(device.value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
    END IF;
    FOR slot IN SELECT key,value FROM jsonb_each(device.value) LOOP
      IF NOT (slot.key = ANY(CASE WHEN device.key='desktop'
        THEN ARRAY['hair','nails','barber','waxing','injectables']
        ELSE ARRAY['hair','nails','lashes','skin','makeup'] END))
        OR jsonb_typeof(slot.value) NOT IN ('string','null') THEN
        RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
      END IF;
      IF jsonb_typeof(slot.value)='string' THEN
        image_url := slot.value #>> '{}';
        IF length(image_url)>2048 OR image_url !~ '^https://[^[:space:]]+$' THEN
          RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id();
  INSERT INTO beauty.platform_settings(key,value,updated_at,updated_by)
  VALUES('homepage_category_media',category_images,now(),actor)
  ON CONFLICT(key) DO UPDATE
    SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  PERFORM beauty.write_admin_audit(actor,'owner','homepage_category_media_updated',
    actor,'platform_setting',NULL,trim(change_reason),category_images);
  RETURN category_images;
END;
$$;
ALTER FUNCTION beauty.owner_set_homepage_category_images(jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.owner_set_homepage_category_images(jsonb,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_set_homepage_category_images(jsonb,text) TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.public_homepage_media()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object(
    'desktopHero', (SELECT value->'desktopHero' FROM beauty.platform_settings WHERE key='homepage_media'),
    'mobileHero', (SELECT value->'mobileHero' FROM beauty.platform_settings WHERE key='homepage_media'),
    'categoryImages', coalesce((SELECT value FROM beauty.platform_settings WHERE key='homepage_category_media'), '{}'::jsonb)
  );
$$;
ALTER FUNCTION beauty.public_homepage_media() OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.public_homepage_media() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.public_homepage_media() TO beauty_app,beauty_catalog;

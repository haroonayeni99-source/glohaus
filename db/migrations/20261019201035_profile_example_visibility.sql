-- Reuse the existing RLS-protected setting store. No marketplace accounts.
INSERT INTO beauty.platform_settings(key,value)
VALUES ('profile_examples','{"enabled":true,"hiddenSlugs":[]}'::jsonb)
ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION beauty.owner_set_profile_examples(next_enabled boolean, hidden_slugs text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE actor uuid; next_value jsonb;
BEGIN
  actor := beauty.require_owner();
  IF next_enabled IS NULL OR hidden_slugs IS NULL
    OR cardinality(hidden_slugs)>10
    OR EXISTS(SELECT 1 FROM unnest(hidden_slugs) s WHERE s IS NULL OR length(s)>80 OR s !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  next_value := jsonb_build_object('enabled',next_enabled,'hiddenSlugs',coalesce((SELECT jsonb_agg(s ORDER BY s) FROM (SELECT DISTINCT unnest(hidden_slugs) AS s) names),'[]'::jsonb));
  INSERT INTO beauty.platform_settings(key,value,updated_at,updated_by)
  VALUES ('profile_examples',next_value,now(),actor)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by;
  PERFORM beauty.write_admin_audit(actor,'owner','profile_examples.visibility_updated',actor,'platform_setting',NULL,'Owner changed public example profile visibility',next_value);
END $$;
REVOKE ALL ON FUNCTION beauty.owner_set_profile_examples(boolean,text[]) FROM PUBLIC, anon, authenticated, beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.owner_set_profile_examples(boolean,text[]) TO beauty_app;

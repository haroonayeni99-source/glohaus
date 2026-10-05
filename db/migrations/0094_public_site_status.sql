-- Owner-controlled public website availability.
-- Public status is readable through a narrow boolean RPC; only the existing
-- Owner/MFA boundary can change the persisted value.

CREATE TABLE IF NOT EXISTS beauty.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES beauty.users(id)
);

ALTER TABLE beauty.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.platform_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_app_read ON beauty.platform_settings;
CREATE POLICY platform_settings_app_read
ON beauty.platform_settings
FOR SELECT
TO beauty_app
USING (true);

GRANT SELECT ON beauty.platform_settings TO beauty_app;

INSERT INTO beauty.platform_settings(key,value)
VALUES ('public_site', jsonb_build_object('enabled', true))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION beauty.owner_set_public_site_enabled(next_enabled boolean, decision_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE actor uuid;
BEGIN
  actor := beauty.require_owner();
  IF next_enabled IS NULL OR decision_reason IS NULL OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.platform_settings(key,value,updated_at,updated_by)
  VALUES ('public_site', jsonb_build_object('enabled',next_enabled), now(), actor)
  ON CONFLICT (key) DO UPDATE
  SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by;

  PERFORM beauty.write_admin_audit(
    actor,'owner',
    CASE WHEN next_enabled THEN 'public_site.enabled' ELSE 'public_site.disabled' END,
    actor,'platform',NULL,decision_reason,
    jsonb_build_object('enabled',next_enabled)
  );
END
$$;

REVOKE ALL ON FUNCTION beauty.owner_set_public_site_enabled(boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.owner_set_public_site_enabled(boolean,text) TO beauty_app;

CREATE OR REPLACE FUNCTION public.glohaus_public_site_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT coalesce(
    (SELECT (s.value->>'enabled')::boolean
     FROM beauty.platform_settings s
     WHERE s.key='public_site'),
    true
  )
$$;

REVOKE ALL ON FUNCTION public.glohaus_public_site_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.glohaus_public_site_enabled() TO anon, authenticated;

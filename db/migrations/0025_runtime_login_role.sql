-- The web process connects as this dedicated login, then src/lib/db.ts enters
-- beauty_app transaction-locally. Keep the login inert until the trusted
-- operator provisioning script supplies a password and enables LOGIN.
-- Supabase's postgres role is deliberately not a PostgreSQL SUPERUSER. Do not
-- issue ALTER ROLE ... NOSUPERUSER/NOBYPASSRLS here: managed Postgres rejects
-- superuser-attribute changes even when the requested value is false. New
-- roles default to NOSUPERUSER and NOBYPASSRLS; verify those defaults below.
DO $$
DECLARE runtime record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'glohaus_runtime') THEN
    CREATE ROLE glohaus_runtime NOLOGIN
      NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 3;
  END IF;

  SELECT rolsuper, rolbypassrls, rolcanlogin, rolinherit, rolcreatedb,
    rolcreaterole, rolreplication, rolconnlimit
  INTO runtime
  FROM pg_roles WHERE rolname = 'glohaus_runtime';

  IF runtime.rolsuper OR runtime.rolbypassrls OR runtime.rolcanlogin
    OR runtime.rolinherit OR runtime.rolcreatedb OR runtime.rolcreaterole
    OR runtime.rolreplication OR runtime.rolconnlimit <> 3 THEN
    RAISE EXCEPTION 'GLOHAUS_RUNTIME_ROLE_UNSAFE';
  END IF;
END $$;

-- Its sole permission path is the deliberately restricted application role.
-- NOINHERIT means the process must use the existing SET LOCAL ROLE beauty_app
-- transaction boundary rather than acquiring application permissions by default.
GRANT beauty_app TO glohaus_runtime;

-- Do not allow a pre-existing role of the same name to retain accidental direct
-- grants or operator-role membership. Runtime access is entirely via beauty_app.
REVOKE ALL PRIVILEGES ON SCHEMA beauty FROM glohaus_runtime;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA beauty FROM glohaus_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA beauty FROM glohaus_runtime;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA beauty FROM glohaus_runtime;
REVOKE beauty_catalog, beauty_admin_ops, beauty_booking_ops,
  beauty_payment_worker, beauty_financial_worker FROM glohaus_runtime;

-- Dedicated webhook connection: no direct table access or operator ownership.
-- Password and LOGIN activation are supplied securely by the operator, not Git.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='glohaus_payment_runtime') THEN
    CREATE ROLE glohaus_payment_runtime NOLOGIN NOINHERIT
      NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 3;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='glohaus_payment_runtime'
      AND (rolsuper OR rolbypassrls OR rolinherit OR rolcreatedb
        OR rolcreaterole OR rolreplication OR rolconnlimit<>3)
  ) THEN
    RAISE EXCEPTION 'GLOHAUS_PAYMENT_RUNTIME_ROLE_UNSAFE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='beauty'
      AND pg_has_role('glohaus_payment_runtime',c.relowner,'MEMBER')
  ) THEN
    RAISE EXCEPTION 'GLOHAUS_PAYMENT_RUNTIME_OWNS_APPLICATION_OBJECT';
  END IF;
END $$;

REVOKE ALL ON SCHEMA beauty FROM glohaus_payment_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA beauty FROM glohaus_payment_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA beauty FROM glohaus_payment_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA beauty FROM glohaus_payment_runtime;
REVOKE beauty_app,beauty_catalog,beauty_admin_ops,beauty_booking_ops,
  beauty_financial_worker FROM glohaus_payment_runtime;
GRANT beauty_payment_worker TO glohaus_payment_runtime;

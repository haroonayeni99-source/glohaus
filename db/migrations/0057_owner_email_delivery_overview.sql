-- Owner-only aggregate visibility into transactional email health.
-- Exposes counts, never recipient addresses or raw provider payloads.

CREATE POLICY email_provider_events_admin_read
  ON beauty.email_provider_events
  FOR SELECT
  TO beauty_admin_ops
  USING (true);

CREATE POLICY email_suppressions_admin_read
  ON beauty.email_suppressions
  FOR SELECT
  TO beauty_admin_ops
  USING (true);

CREATE POLICY notification_outbox_admin_read
  ON beauty.notification_outbox
  FOR SELECT
  TO beauty_admin_ops
  USING (true);

GRANT SELECT ON beauty.email_provider_events, beauty.email_suppressions, beauty.notification_outbox TO beauty_admin_ops;

CREATE FUNCTION beauty.owner_email_delivery_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
BEGIN
  PERFORM beauty.require_owner();

  RETURN jsonb_build_object(
    'queued', (SELECT count(*)::integer FROM beauty.notification_outbox WHERE sent_at IS NULL),
    'accepted', (SELECT count(*)::integer FROM beauty.notification_outbox WHERE delivery_status='sent'),
    'delivered', (SELECT count(*)::integer FROM beauty.notification_outbox WHERE delivery_status='delivered'),
    'bounced', (SELECT count(*)::integer FROM beauty.notification_outbox WHERE delivery_status='bounced'),
    'complained', (SELECT count(*)::integer FROM beauty.notification_outbox WHERE delivery_status='complained'),
    'failed', (SELECT count(*)::integer FROM beauty.notification_outbox WHERE delivery_status='failed'),
    'suppressed', (SELECT count(*)::integer FROM beauty.email_suppressions),
    'lastProviderEventAt', (
      SELECT max(provider_event_at)
      FROM beauty.notification_outbox
      WHERE provider_event_at IS NOT NULL
    )
  );
END;
$fn$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_email_delivery_overview() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.owner_email_delivery_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.owner_email_delivery_overview() TO beauty_app;

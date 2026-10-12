-- The Owner email overview now aggregates Shop and booking delivery records.
-- Its existing SECURITY DEFINER role lacked both column access and an RLS
-- policy for the Shop outbox, so the whole section failed to load.
-- Permit only the reporting columns; recipient IDs and email jobs stay private.
GRANT SELECT (sent_at, delivery_status, provider_event_at)
  ON beauty.product_notification_outbox TO beauty_admin_ops;

CREATE POLICY product_notification_outbox_admin_delivery_read
  ON beauty.product_notification_outbox
  FOR SELECT TO beauty_admin_ops
  USING (true);

-- The existing function keeps its verified-Owner guard and aggregate-only
-- return value. No sending, retrying, suppression or saved settings change.

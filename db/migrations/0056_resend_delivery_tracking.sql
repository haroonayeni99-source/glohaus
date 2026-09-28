-- Track real provider delivery outcomes for transactional email.
-- Resend acceptance is not the same as successful delivery, so keep provider
-- IDs and verified webhook events in the protected notification boundary.

ALTER TABLE beauty.notification_outbox
  ADD COLUMN IF NOT EXISTS provider_email_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_event_at timestamptz;

ALTER TABLE beauty.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_delivery_status_check;
ALTER TABLE beauty.notification_outbox
  ADD CONSTRAINT notification_outbox_delivery_status_check
  CHECK (
    delivery_status IS NULL OR
    delivery_status IN ('sent','delivered','bounced','complained','failed','suppressed')
  );

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_provider_email_id_idx
  ON beauty.notification_outbox(provider_email_id)
  WHERE provider_email_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS beauty.email_provider_events (
  event_id text PRIMARY KEY,
  provider_email_id text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beauty.email_suppressions (
  email text PRIMARY KEY,
  reason text NOT NULL CHECK (reason IN ('bounced','complained','suppressed')),
  provider_email_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beauty.email_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.email_provider_events FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.email_suppressions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON beauty.email_provider_events, beauty.email_suppressions FROM PUBLIC;

DROP FUNCTION IF EXISTS beauty.finish_notification(uuid,boolean);

CREATE FUNCTION beauty.finish_notification(
  target uuid,
  succeeded boolean,
  provider_id text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  UPDATE beauty.notification_outbox
  SET
    sent_at = CASE WHEN succeeded THEN now() ELSE sent_at END,
    provider_email_id = CASE WHEN succeeded THEN provider_id ELSE provider_email_id END,
    delivery_status = CASE WHEN succeeded THEN 'sent' ELSE delivery_status END,
    claimed_until = NULL,
    due_at = CASE WHEN succeeded THEN due_at ELSE now() + interval '15 minutes' END,
    last_error = CASE WHEN succeeded THEN NULL ELSE 'DELIVERY_FAILED' END
  WHERE id = target AND sent_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION beauty.record_email_provider_event(
  provider_event_id text,
  provider_id text,
  provider_event_type text,
  provider_event_at timestamptz,
  recipient_email text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  normalized_status text;
BEGIN
  normalized_status := CASE provider_event_type
    WHEN 'email.delivered' THEN 'delivered'
    WHEN 'email.bounced' THEN 'bounced'
    WHEN 'email.complained' THEN 'complained'
    WHEN 'email.failed' THEN 'failed'
    WHEN 'email.suppressed' THEN 'suppressed'
    ELSE NULL
  END;

  IF normalized_status IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO beauty.email_provider_events(event_id,provider_email_id,event_type)
  VALUES(provider_event_id,provider_id,provider_event_type)
  ON CONFLICT(event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE beauty.notification_outbox
  SET
    delivery_status = normalized_status,
    delivered_at = CASE WHEN normalized_status='delivered' THEN coalesce(provider_event_at,now()) ELSE delivered_at END,
    provider_event_at = coalesce(provider_event_at,now()),
    last_error = CASE
      WHEN normalized_status IN ('bounced','complained','failed','suppressed') THEN upper(normalized_status)
      ELSE last_error
    END
  WHERE provider_email_id = provider_id;

  IF normalized_status IN ('bounced','complained','suppressed') AND recipient_email IS NOT NULL THEN
    INSERT INTO beauty.email_suppressions(email,reason,provider_email_id)
    VALUES(lower(recipient_email),normalized_status,provider_id)
    ON CONFLICT(email) DO UPDATE
    SET reason=excluded.reason,
        provider_email_id=excluded.provider_email_id,
        updated_at=now();
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION beauty.claim_notifications()
RETURNS TABLE(
  id uuid,
  booking_id uuid,
  kind text,
  email text,
  service_name text,
  professional_name text,
  starts_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
 RETURN QUERY
 WITH eligible AS (
   SELECT n.id
   FROM beauty.notification_outbox n
   JOIN beauty.bookings b ON b.id=n.booking_id
   JOIN beauty.users u ON u.id=n.recipient_user_id
   WHERE n.sent_at IS NULL
     AND n.due_at<=now()
     AND (n.claimed_until IS NULL OR n.claimed_until<now())
     AND n.attempts<5
     AND (n.first_attempt_at IS NULL OR n.first_attempt_at>now()-interval '23 hours')
     AND NOT EXISTS (
       SELECT 1
       FROM beauty.email_suppressions s
       WHERE s.email=lower(u.email)
     )
     AND (
       (n.kind='confirmation' AND b.status IN('confirmed','completed')) OR
       (n.kind='cancellation' AND b.status='cancelled') OR
       (n.kind='reminder' AND b.status='confirmed' AND b.starts_at>now()) OR
       (n.kind='review_request' AND b.status='completed')
     )
   ORDER BY n.due_at
   LIMIT 20
   FOR UPDATE OF n SKIP LOCKED
 ),
 claimed AS (
   UPDATE beauty.notification_outbox n
   SET claimed_until=now()+interval '5 minutes',
       attempts=n.attempts+1,
       first_attempt_at=coalesce(n.first_attempt_at,now())
   FROM eligible
   WHERE n.id=eligible.id
   RETURNING n.*
 )
 SELECT n.id,n.booking_id,n.kind,u.email,b.service_name,b.professional_name,b.starts_at
 FROM claimed n
 JOIN beauty.users u ON u.id=n.recipient_user_id
 JOIN beauty.bookings b ON b.id=n.booking_id;
END;
$$;

GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER TABLE beauty.email_provider_events OWNER TO beauty_booking_ops;
ALTER TABLE beauty.email_suppressions OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.finish_notification(uuid,boolean,text) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.record_email_provider_event(text,text,text,timestamptz,text) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.claim_notifications() OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;

REVOKE ALL ON FUNCTION beauty.finish_notification(uuid,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.record_email_provider_event(text,text,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.claim_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.finish_notification(uuid,boolean,text) TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.record_email_provider_event(text,text,text,timestamptz,text) TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.claim_notifications() TO beauty_payment_worker;

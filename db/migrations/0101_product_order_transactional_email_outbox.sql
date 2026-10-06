-- Transactional email outbox for GLOHAUS Shop order events.
-- Keeps product-order email delivery separate from booking notifications while
-- sharing suppression, provider-event tracking and Owner delivery health.

CREATE TABLE IF NOT EXISTS beauty.product_notification_outbox(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_order_id uuid NOT NULL REFERENCES beauty.product_orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN(
    'order_paid_customer','order_paid_professional',
    'order_shipped_customer','order_delivered_professional',
    'order_refunded_customer'
  )),
  recipient_user_id uuid NOT NULL REFERENCES beauty.users(id),
  due_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  claimed_until timestamptz,
  first_attempt_at timestamptz,
  provider_email_id text,
  delivery_status text CHECK(
    delivery_status IS NULL OR delivery_status IN(
      'sent','delivered','bounced','complained','failed','suppressed'
    )
  ),
  delivered_at timestamptz,
  provider_event_at timestamptz,
  UNIQUE(product_order_id,kind,recipient_user_id)
);

CREATE INDEX IF NOT EXISTS product_notification_outbox_due_idx
  ON beauty.product_notification_outbox(due_at)
  WHERE sent_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_notification_outbox_provider_email_id_idx
  ON beauty.product_notification_outbox(provider_email_id)
  WHERE provider_email_id IS NOT NULL;

ALTER TABLE beauty.product_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.product_notification_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE beauty.product_notification_outbox FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT,UPDATE ON beauty.product_notification_outbox TO beauty_payment_worker;

CREATE OR REPLACE FUNCTION beauty.enqueue_product_order_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE professional_user uuid;
BEGIN
  SELECT user_id INTO professional_user
  FROM beauty.professional_profiles
  WHERE id=NEW.professional_id;

  IF TG_OP='INSERT' AND NEW.status='paid' THEN
    INSERT INTO beauty.product_notification_outbox(product_order_id,kind,recipient_user_id,due_at)
    VALUES
      (NEW.id,'order_paid_customer',NEW.customer_id,now()),
      (NEW.id,'order_paid_professional',professional_user,now())
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='shipped' THEN
      INSERT INTO beauty.product_notification_outbox(product_order_id,kind,recipient_user_id,due_at)
      VALUES(NEW.id,'order_shipped_customer',NEW.customer_id,now())
      ON CONFLICT DO NOTHING;
    ELSIF NEW.status='delivered' THEN
      INSERT INTO beauty.product_notification_outbox(product_order_id,kind,recipient_user_id,due_at)
      VALUES(NEW.id,'order_delivered_professional',professional_user,now())
      ON CONFLICT DO NOTHING;
    ELSIF NEW.status='refunded' THEN
      INSERT INTO beauty.product_notification_outbox(product_order_id,kind,recipient_user_id,due_at)
      VALUES(NEW.id,'order_refunded_customer',NEW.customer_id,now())
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_order_email_notifications ON beauty.product_orders;
CREATE TRIGGER product_order_email_notifications
AFTER INSERT OR UPDATE OF status ON beauty.product_orders
FOR EACH ROW EXECUTE FUNCTION beauty.enqueue_product_order_email();

REVOKE ALL ON FUNCTION beauty.enqueue_product_order_email() FROM PUBLIC,anon,authenticated,beauty_app;

CREATE OR REPLACE FUNCTION beauty.claim_product_order_notifications()
RETURNS TABLE(
  id uuid,product_order_id uuid,kind text,email text,professional_name text,
  total_pence integer,tracking_carrier text,tracking_number text,
  shipped_at timestamptz,delivered_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT n.id
    FROM beauty.product_notification_outbox n
    JOIN beauty.product_orders o ON o.id=n.product_order_id
    JOIN beauty.users u ON u.id=n.recipient_user_id
    WHERE n.sent_at IS NULL
      AND n.due_at<=now()
      AND (n.claimed_until IS NULL OR n.claimed_until<now())
      AND n.attempts<5
      AND (n.first_attempt_at IS NULL OR n.first_attempt_at>now()-interval '23 hours')
      AND NOT EXISTS (
        SELECT 1 FROM beauty.email_suppressions s WHERE s.email=lower(u.email)
      )
      AND (
        (n.kind IN('order_paid_customer','order_paid_professional')
          AND o.status IN('paid','processing','shipped','delivered'))
        OR (n.kind='order_shipped_customer' AND o.status IN('shipped','delivered'))
        OR (n.kind='order_delivered_professional' AND o.status='delivered')
        OR (n.kind='order_refunded_customer' AND o.status='refunded')
      )
    ORDER BY n.due_at
    LIMIT 20
    FOR UPDATE OF n SKIP LOCKED
  ),
  claimed AS (
    UPDATE beauty.product_notification_outbox n
    SET claimed_until=now()+interval '5 minutes',
        attempts=n.attempts+1,
        first_attempt_at=coalesce(n.first_attempt_at,now())
    FROM eligible
    WHERE n.id=eligible.id
    RETURNING n.*
  )
  SELECT n.id,n.product_order_id,n.kind,u.email,o.professional_name,
         o.total_pence,o.tracking_carrier,o.tracking_number,o.shipped_at,o.delivered_at
  FROM claimed n
  JOIN beauty.users u ON u.id=n.recipient_user_id
  JOIN beauty.product_orders o ON o.id=n.product_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION beauty.finish_product_order_notification(
  target uuid,succeeded boolean,provider_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  UPDATE beauty.product_notification_outbox
  SET sent_at=CASE WHEN succeeded THEN now() ELSE sent_at END,
      provider_email_id=CASE WHEN succeeded THEN provider_id ELSE provider_email_id END,
      delivery_status=CASE WHEN succeeded THEN 'sent' ELSE delivery_status END,
      claimed_until=NULL,
      due_at=CASE WHEN succeeded THEN due_at ELSE now()+interval '15 minutes' END,
      last_error=CASE WHEN succeeded THEN NULL ELSE 'DELIVERY_FAILED' END
  WHERE id=target AND sent_at IS NULL;
$$;

REVOKE ALL ON FUNCTION beauty.claim_product_order_notifications() FROM PUBLIC,anon,authenticated,beauty_app;
REVOKE ALL ON FUNCTION beauty.finish_product_order_notification(uuid,boolean,text) FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.claim_product_order_notifications() TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.finish_product_order_notification(uuid,boolean,text) TO beauty_payment_worker;

CREATE OR REPLACE FUNCTION beauty.record_email_provider_event(
  provider_event_id text,provider_id text,provider_event_type text,
  provider_event_at timestamptz,recipient_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE normalized_status text; matched boolean := false;
BEGIN
  normalized_status := CASE provider_event_type
    WHEN 'email.delivered' THEN 'delivered'
    WHEN 'email.bounced' THEN 'bounced'
    WHEN 'email.complained' THEN 'complained'
    WHEN 'email.failed' THEN 'failed'
    WHEN 'email.suppressed' THEN 'suppressed'
    ELSE NULL
  END;
  IF normalized_status IS NULL THEN RETURN false; END IF;

  matched := EXISTS(
    SELECT 1 FROM beauty.notification_outbox WHERE provider_email_id=provider_id
  ) OR EXISTS(
    SELECT 1 FROM beauty.product_notification_outbox WHERE provider_email_id=provider_id
  );
  IF NOT matched THEN RETURN false; END IF;

  INSERT INTO beauty.email_provider_events(event_id,provider_email_id,event_type)
  VALUES(provider_event_id,provider_id,provider_event_type)
  ON CONFLICT(event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE beauty.notification_outbox
  SET delivery_status=normalized_status,
      delivered_at=CASE WHEN normalized_status='delivered' THEN coalesce(provider_event_at,now()) ELSE delivered_at END,
      provider_event_at=coalesce(provider_event_at,now()),
      last_error=CASE WHEN normalized_status IN('bounced','complained','failed','suppressed')
        THEN upper(normalized_status) ELSE last_error END
  WHERE provider_email_id=provider_id;

  UPDATE beauty.product_notification_outbox
  SET delivery_status=normalized_status,
      delivered_at=CASE WHEN normalized_status='delivered' THEN coalesce(provider_event_at,now()) ELSE delivered_at END,
      provider_event_at=coalesce(provider_event_at,now()),
      last_error=CASE WHEN normalized_status IN('bounced','complained','failed','suppressed')
        THEN upper(normalized_status) ELSE last_error END
  WHERE provider_email_id=provider_id;

  IF normalized_status IN('bounced','complained','suppressed') AND recipient_email IS NOT NULL THEN
    INSERT INTO beauty.email_suppressions(email,reason,provider_email_id)
    VALUES(lower(recipient_email),normalized_status,provider_id)
    ON CONFLICT(email) DO UPDATE
    SET reason=excluded.reason,provider_email_id=excluded.provider_email_id,updated_at=now();
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION beauty.owner_email_delivery_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  PERFORM beauty.require_owner();
  RETURN jsonb_build_object(
    'queued',((SELECT count(*) FROM beauty.notification_outbox WHERE sent_at IS NULL)
      +(SELECT count(*) FROM beauty.product_notification_outbox WHERE sent_at IS NULL))::integer,
    'accepted',((SELECT count(*) FROM beauty.notification_outbox WHERE delivery_status='sent')
      +(SELECT count(*) FROM beauty.product_notification_outbox WHERE delivery_status='sent'))::integer,
    'delivered',((SELECT count(*) FROM beauty.notification_outbox WHERE delivery_status='delivered')
      +(SELECT count(*) FROM beauty.product_notification_outbox WHERE delivery_status='delivered'))::integer,
    'bounced',((SELECT count(*) FROM beauty.notification_outbox WHERE delivery_status='bounced')
      +(SELECT count(*) FROM beauty.product_notification_outbox WHERE delivery_status='bounced'))::integer,
    'complained',((SELECT count(*) FROM beauty.notification_outbox WHERE delivery_status='complained')
      +(SELECT count(*) FROM beauty.product_notification_outbox WHERE delivery_status='complained'))::integer,
    'failed',((SELECT count(*) FROM beauty.notification_outbox WHERE delivery_status='failed')
      +(SELECT count(*) FROM beauty.product_notification_outbox WHERE delivery_status='failed'))::integer,
    'suppressed',(SELECT count(*)::integer FROM beauty.email_suppressions),
    'lastProviderEventAt',(
      SELECT max(event_at) FROM (
        SELECT max(provider_event_at) event_at FROM beauty.notification_outbox
        UNION ALL
        SELECT max(provider_event_at) event_at FROM beauty.product_notification_outbox
      ) q
    )
  );
END;
$$;

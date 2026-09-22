-- Private, persistent notification inboxes. These records are not part of the
-- public catalogue and are never exposed through a browser service role.
CREATE TABLE beauty.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES beauty.users(id),
  booking_id uuid REFERENCES beauty.bookings(id),
  kind text NOT NULL CHECK(kind IN (
    'booking_created','booking_confirmed','booking_cancelled','appointment_completed'
  )),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 500),
  href text NOT NULL CHECK(href ~ '^/[a-zA-Z0-9_/?=&-]*$'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_id,user_id,kind)
);
CREATE INDEX in_app_notifications_recipient
  ON beauty.in_app_notifications(user_id,read_at,created_at DESC);

ALTER TABLE beauty.in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.in_app_notifications FORCE ROW LEVEL SECURITY;

-- The runtime connection is scoped with a verified auth ID. The user can read
-- their own inbox and mark a record read, but has no insert/delete/content-edit
-- permission and cannot assign a notification to another user.
CREATE POLICY in_app_notification_self_read ON beauty.in_app_notifications
  FOR SELECT TO beauty_app
  USING (EXISTS(
    SELECT 1 FROM beauty.users u
    WHERE u.id=in_app_notifications.user_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  ));
CREATE POLICY in_app_notification_self_mark_read ON beauty.in_app_notifications
  FOR UPDATE TO beauty_app
  USING (EXISTS(
    SELECT 1 FROM beauty.users u
    WHERE u.id=in_app_notifications.user_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  ))
  WITH CHECK (EXISTS(
    SELECT 1 FROM beauty.users u
    WHERE u.id=in_app_notifications.user_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  ));
GRANT SELECT ON beauty.in_app_notifications TO beauty_app;
GRANT UPDATE(read_at) ON beauty.in_app_notifications TO beauty_app;

-- Booking and payment operators create the events from state changes. They do
-- not receive a broad application read path for customer inboxes.
GRANT INSERT ON beauty.in_app_notifications TO beauty_booking_ops,beauty_payment_worker;
CREATE POLICY in_app_notification_booking_ops_insert ON beauty.in_app_notifications
  FOR INSERT TO beauty_booking_ops WITH CHECK(true);
CREATE POLICY in_app_notification_payment_worker_insert ON beauty.in_app_notifications
  FOR INSERT TO beauty_payment_worker WITH CHECK(true);

CREATE FUNCTION beauty.record_booking_activity_notification()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.status='payment_pending' THEN
    INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href)
    VALUES(
      NEW.customer_id,NEW.id,'booking_created','Booking held',
      'Your appointment is held while your payment is completed.',
      '/account/bookings/' || NEW.id::text
    ) ON CONFLICT DO NOTHING;
  ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='confirmed' THEN
      INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href)
      VALUES
        (NEW.customer_id,NEW.id,'booking_confirmed','Booking confirmed',
          'Your appointment has been confirmed.', '/account/bookings/' || NEW.id::text),
        ((SELECT user_id FROM beauty.professional_profiles WHERE id=NEW.professional_id),NEW.id,'booking_confirmed','New booking confirmed',
          'A customer has a confirmed appointment with you.', '/account/bookings/' || NEW.id::text)
      ON CONFLICT DO NOTHING;
    ELSIF NEW.status='cancelled' THEN
      INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href)
      VALUES
        (NEW.customer_id,NEW.id,'booking_cancelled','Booking cancelled',
          'This appointment was cancelled. Any refund is handled separately.', '/account/bookings/' || NEW.id::text),
        ((SELECT user_id FROM beauty.professional_profiles WHERE id=NEW.professional_id),NEW.id,'booking_cancelled','Booking cancelled',
          'An appointment in your calendar was cancelled.', '/account/bookings/' || NEW.id::text)
      ON CONFLICT DO NOTHING;
    ELSIF NEW.status='completed' THEN
      INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href)
      VALUES(
        NEW.customer_id,NEW.id,'appointment_completed','Appointment completed',
        'Share a verified review when you are ready.', '/account/bookings/' || NEW.id::text
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER booking_activity_notifications
AFTER INSERT OR UPDATE OF status ON beauty.bookings
FOR EACH ROW EXECUTE FUNCTION beauty.record_booking_activity_notification();

REVOKE ALL ON FUNCTION beauty.record_booking_activity_notification() FROM PUBLIC;

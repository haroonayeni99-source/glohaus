-- Extend the existing inbox and transactional email outbox. No payment,
-- booking, order state machine or financial rule is changed.
CREATE ROLE beauty_notification_ops NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT beauty_notification_ops TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_notification_ops;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_notification_ops;
CREATE INDEX bookings_notification_due_idx ON beauty.bookings(starts_at,id) WHERE status='confirmed';
CREATE TABLE beauty.notification_preferences (
 user_id uuid NOT NULL REFERENCES beauty.users(id),
 category text NOT NULL CHECK(category IN('bookings','orders','changes','messages','reminders','reviews','promotions')),
 email boolean NOT NULL DEFAULT true, push boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,category),
 CHECK(category NOT IN('bookings','orders','changes') OR email)
);
CREATE TABLE beauty.push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES beauty.users(id),
 endpoint text NOT NULL UNIQUE CHECK(length(endpoint)<=2048 AND endpoint ~ '^https://'),
 p256dh text NOT NULL CHECK(length(p256dh) BETWEEN 87 AND 88),
 auth text NOT NULL CHECK(length(auth) BETWEEN 22 AND 24),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(), last_success_at timestamptz,
 disabled_at timestamptz, last_error text
);
CREATE INDEX push_subscriptions_user_idx ON beauty.push_subscriptions(user_id) WHERE disabled_at IS NULL;
CREATE TABLE beauty.push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id uuid NOT NULL REFERENCES beauty.in_app_notifications(id),
 subscription_id uuid NOT NULL REFERENCES beauty.push_subscriptions(id),
 due_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
 claimed_until timestamptz, sent_at timestamptz, last_error text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','failed','expired','skipped')),
 UNIQUE(notification_id,subscription_id)
);
CREATE INDEX push_deliveries_due_idx ON beauty.push_deliveries(due_at) WHERE status='pending';
CREATE INDEX push_deliveries_subscription_idx ON beauty.push_deliveries(subscription_id);
ALTER TABLE beauty.in_app_notifications ADD COLUMN event_key text;
ALTER TABLE beauty.in_app_notifications DROP CONSTRAINT in_app_notifications_booking_id_user_id_kind_key;
CREATE UNIQUE INDEX in_app_legacy_reminder_unique ON beauty.in_app_notifications(booking_id,user_id,kind) WHERE kind='booking_reminder' AND event_key IS NULL;
CREATE UNIQUE INDEX in_app_notification_booking_transition_unique ON beauty.in_app_notifications(booking_id,user_id,kind) WHERE event_key IS NULL AND kind<>'booking_reminder';
DROP INDEX beauty.in_app_notification_product_order_unique;
CREATE UNIQUE INDEX in_app_notification_product_order_unique ON beauty.in_app_notifications(product_order_id,user_id,kind) WHERE product_order_id IS NOT NULL AND event_key IS NULL;
CREATE UNIQUE INDEX in_app_notifications_event_key_idx ON beauty.in_app_notifications(user_id,event_key) WHERE event_key IS NOT NULL;
ALTER TABLE beauty.notification_outbox ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE beauty.notification_outbox ADD COLUMN notification_id uuid REFERENCES beauty.in_app_notifications(id);
CREATE UNIQUE INDEX notification_outbox_inbox_idx ON beauty.notification_outbox(notification_id) WHERE notification_id IS NOT NULL;
ALTER TABLE beauty.notification_outbox DROP CONSTRAINT notification_outbox_kind_check;
ALTER TABLE beauty.notification_outbox ADD CHECK(kind IN('confirmation','cancellation','reminder','review_request','rescheduled','late_notice','requirements_update','professional_alert'));
ALTER TABLE beauty.notification_outbox ADD CHECK((kind='professional_alert' AND notification_id IS NOT NULL) OR (kind<>'professional_alert' AND booking_id IS NOT NULL));
ALTER TABLE beauty.in_app_notifications DROP CONSTRAINT in_app_notifications_kind_check;
ALTER TABLE beauty.in_app_notifications ADD CHECK(kind IN('booking_created','booking_confirmed','booking_cancelled','appointment_completed','booking_reminder','order_paid','order_processing','order_shipped','order_delivered','order_refund_pending','order_refunded','order_shipping_reminder','commission_changed','booking_policy_update','professional_policy_review','professional_activity','customer_message','review_received','dispute_opened','refund_requested','push_test','promotion','order_cancelled'));
ALTER TABLE beauty.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.notification_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.notification_preferences FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.notification_preferences TO beauty_notification_ops;
CREATE POLICY notification_internal ON beauty.notification_preferences FOR ALL TO beauty_notification_ops USING(true) WITH CHECK(true);
ALTER TABLE beauty.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.push_subscriptions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.push_subscriptions FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.push_subscriptions TO beauty_notification_ops;
CREATE POLICY notification_internal ON beauty.push_subscriptions FOR ALL TO beauty_notification_ops USING(true) WITH CHECK(true);
ALTER TABLE beauty.push_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.push_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.push_deliveries FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.push_deliveries TO beauty_notification_ops;
CREATE POLICY notification_internal ON beauty.push_deliveries FOR ALL TO beauty_notification_ops USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.users TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.users FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.user_roles TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.user_roles FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.professional_profiles TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.professional_profiles FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.bookings TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.bookings FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.payments TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.payments FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.conversations TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.conversations FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.messages TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.messages FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.reviews TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.reviews FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.booking_disputes TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.booking_disputes FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.refund_appeals TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.refund_appeals FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.product_orders TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.product_orders FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.product_order_items TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.product_order_items FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.marketing_preferences TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.marketing_preferences FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.marketing_campaigns TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.marketing_campaigns FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT ON beauty.marketing_outbox TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.marketing_outbox FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT,INSERT,UPDATE ON beauty.in_app_notifications TO beauty_notification_ops;
CREATE POLICY notification_internal ON beauty.in_app_notifications FOR ALL TO beauty_notification_ops USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON beauty.notification_outbox TO beauty_notification_ops;
CREATE POLICY notification_internal ON beauty.notification_outbox FOR ALL TO beauty_notification_ops USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.notification_actor() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE uid uuid; BEGIN
 SELECT u.id INTO uid FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
 WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL
 AND (u.restricted_until IS NULL OR u.restricted_until<=now());
 IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; RETURN uid;
END $$;
CREATE FUNCTION beauty.notification_category(kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN kind='booking_confirmed' THEN 'bookings'
 WHEN kind IN('booking_cancelled','booking_policy_update','dispute_opened','refund_requested') THEN 'changes'
 WHEN kind='booking_reminder' THEN 'reminders' WHEN kind='customer_message' THEN 'messages'
 WHEN kind='review_received' THEN 'reviews' WHEN kind='promotion' THEN 'promotions'
 WHEN kind LIKE 'order_%' THEN 'orders' ELSE 'critical' END
$$;
CREATE FUNCTION beauty.notification_allowed(uid uuid,category text,channel text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN channel='email' AND category IN('bookings','orders','changes','critical') THEN true
 ELSE coalesce((SELECT CASE WHEN channel='email' THEN p.email ELSE p.push END FROM beauty.notification_preferences p WHERE p.user_id=notification_allowed.uid AND p.category=notification_allowed.category), channel='email' AND category<>'promotions') END
$$;
CREATE FUNCTION beauty.my_notification_settings() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.notification_actor(); BEGIN
 RETURN jsonb_build_object('preferences',(SELECT jsonb_agg(jsonb_build_object('category',c,'email',CASE WHEN c='promotions' THEN coalesce((SELECT professional_promotions FROM beauty.marketing_preferences WHERE user_id=uid),false) ELSE beauty.notification_allowed(uid,c,'email') END,'push',beauty.notification_allowed(uid,c,'push'))) FROM unnest(ARRAY['bookings','orders','changes','messages','reminders','reviews','promotions']) c),
 'devices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'created_at',created_at,'last_success_at',last_success_at,'disabled_at',disabled_at) ORDER BY created_at DESC),'[]'::jsonb) FROM beauty.push_subscriptions WHERE user_id=uid));
END $$;
CREATE FUNCTION beauty.set_notification_preference(category text,email boolean,push boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.notification_actor(); BEGIN
 IF category NOT IN('bookings','orders','changes','messages','reminders','reviews','promotions') OR email IS NULL OR push IS NULL OR (category IN('bookings','orders','changes') AND NOT email) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.notification_preferences(user_id,category,email,push) VALUES(uid,category,email,push)
 ON CONFLICT ON CONSTRAINT notification_preferences_pkey DO UPDATE SET email=excluded.email,push=excluded.push,updated_at=now();
 IF NOT email THEN
  UPDATE beauty.notification_outbox n SET delivery_status='suppressed',last_error='PREFERENCE_DISABLED'
  WHERE n.recipient_user_id=uid AND n.kind='professional_alert' AND n.sent_at IS NULL
  AND EXISTS(SELECT 1 FROM beauty.in_app_notifications i WHERE i.id=n.notification_id AND beauty.notification_category(i.kind)=set_notification_preference.category);
 END IF;
 IF category='promotions' THEN
  -- Merge one field; preserve all other marketing choices and unsubscribe token.
  INSERT INTO beauty.marketing_preferences(user_id,professional_promotions) VALUES(uid,email)
  ON CONFLICT(user_id) DO UPDATE SET professional_promotions=excluded.professional_promotions,updated_at=now();
 END IF;
END $$;
CREATE FUNCTION beauty.save_push_subscription(endpoint text,p256dh text,auth text,label text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.notification_actor(); result uuid; BEGIN
 IF endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-zA-Z0-9.-]+\.push\.apple\.com|[a-zA-Z0-9.-]+\.notify\.windows\.com|wns\.windows\.com)/' OR p256dh !~ '^[A-Za-z0-9_-]{87}=?$' OR auth !~ '^[A-Za-z0-9_-]{22}={0,2}$' THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM beauty.push_subscriptions WHERE user_id=uid AND disabled_at IS NULL AND push_subscriptions.endpoint<>save_push_subscription.endpoint)>=10 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.push_subscriptions(user_id,endpoint,p256dh,auth,label) VALUES(uid,endpoint,p256dh,auth,label)
 ON CONFLICT ON CONSTRAINT push_subscriptions_endpoint_key DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,label=excluded.label,disabled_at=NULL,last_error=NULL
 WHERE push_subscriptions.user_id=uid RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; RETURN result;
END $$;
CREATE FUNCTION beauty.disable_push_subscription(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.notification_actor(); BEGIN
 UPDATE beauty.push_subscriptions SET disabled_at=now() WHERE id=target AND user_id=uid;
END $$;
CREATE FUNCTION beauty.test_push_subscription(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.notification_actor(); nid uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.push_subscriptions WHERE id=target AND user_id=uid AND disabled_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM beauty.in_app_notifications WHERE user_id=uid AND kind='push_test' AND created_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href) VALUES(uid,'push_test','Push test requested','This is your requested device notification test.','/professional/settings/notifications') RETURNING id INTO nid;
 INSERT INTO beauty.push_deliveries(notification_id,subscription_id) VALUES(nid,target) ON CONFLICT DO NOTHING;
END $$;
-- Single fan-out point for genuine professional inbox events. Existing email
-- producers retain ownership of bookings and orders; only missing kinds enqueue here.
CREATE FUNCTION beauty.fanout_professional_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cat text:=beauty.notification_category(NEW.kind); BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.user_id=NEW.user_id AND u.status='active' AND u.deleted_at IS NULL) THEN RETURN NEW; END IF;
 IF NEW.kind IN('customer_message','review_received','dispute_opened','refund_requested','order_refund_pending','order_shipping_reminder','order_cancelled') AND beauty.notification_allowed(NEW.user_id,cat,'email') THEN
  INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id,notification_id,event_reference)
  VALUES(NEW.booking_id,'professional_alert',NEW.user_id,NEW.id,NEW.id::text) ON CONFLICT DO NOTHING;
 END IF;
 IF NEW.kind<>'push_test' AND beauty.notification_allowed(NEW.user_id,cat,'push') THEN
  INSERT INTO beauty.push_deliveries(notification_id,subscription_id)
  SELECT NEW.id,s.id FROM beauty.push_subscriptions s WHERE s.user_id=NEW.user_id AND s.disabled_at IS NULL ON CONFLICT DO NOTHING;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER professional_notification_fanout AFTER INSERT ON beauty.in_app_notifications FOR EACH ROW EXECUTE FUNCTION beauty.fanout_professional_notification();
CREATE FUNCTION beauty.record_professional_source_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid; bid uuid; notice text; event text; heading text; detail text; link text; BEGIN
 IF TG_TABLE_NAME='messages' THEN
  IF NEW.sender_role<>'customer' THEN RETURN NEW; END IF;
  SELECT p.user_id INTO uid FROM beauty.conversations c JOIN beauty.professional_profiles p ON p.id=c.professional_id WHERE c.id=NEW.conversation_id;
  notice:='customer_message';event:='message:'||NEW.id;heading:='New customer message';detail:='A customer sent you a private message. Open your inbox to reply.';link:='/messages/'||NEW.conversation_id||'?view=professional';
 ELSIF TG_TABLE_NAME='reviews' THEN
  bid:=NEW.booking_id;notice:='review_received';event:='review:'||NEW.id;heading:='New verified-booking review';detail:='A customer reviewed a completed appointment. Read the review in your dashboard.';link:='/professional/reviews';
  IF NOT EXISTS(SELECT 1 FROM beauty.bookings WHERE id=bid AND status='completed') THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='booking_disputes' THEN
  IF NEW.status NOT IN('warning_needs_response','warning_under_review','needs_response','under_review') THEN RETURN NEW; END IF;
  bid:=NEW.booking_id;notice:='dispute_opened';event:='dispute:'||NEW.id;heading:='Payment dispute requires review';detail:='A payment dispute is open. Review the appointment and contact GLOHAUS support.';
 ELSIF TG_TABLE_NAME='refund_appeals' THEN
  bid:=NEW.booking_id;notice:='refund_requested';event:='refund-appeal:'||NEW.id;heading:='Refund review requested';detail:='A customer requested a refund review. Review the appointment for the current decision.';
 ELSIF TG_TABLE_NAME='payments' THEN
  IF NEW.status<>'refund_required' OR (TG_OP='UPDATE' AND OLD.status='refund_required') THEN RETURN NEW; END IF;
  bid:=NEW.booking_id;notice:='refund_requested';event:='payment-refund:'||bid;heading:='Booking refund requires action';detail:='A paid booking needs refund processing or review. Check its payment status.';
 ELSIF TG_TABLE_NAME='product_orders' THEN
  IF NEW.status NOT IN('refund_pending','cancelled') OR (TG_OP='UPDATE' AND OLD.status=NEW.status) THEN RETURN NEW; END IF;
  SELECT user_id INTO uid FROM beauty.professional_profiles WHERE id=NEW.professional_id;
  INSERT INTO beauty.in_app_notifications(user_id,product_order_id,kind,title,body,href,event_key)
  VALUES(uid,NEW.id,CASE WHEN NEW.status='cancelled' THEN 'order_cancelled' ELSE 'order_refund_pending' END,CASE WHEN NEW.status='cancelled' THEN 'Shop order cancelled' ELSE 'Shop refund requires action' END,'Review the order status and any required action. Refunds are handled separately.','/professional/orders','order-action:'||NEW.status||':'||NEW.id) ON CONFLICT DO NOTHING;RETURN NEW;
 END IF;
 IF bid IS NOT NULL THEN SELECT p.user_id INTO uid FROM beauty.bookings b JOIN beauty.professional_profiles p ON p.id=b.professional_id WHERE b.id=bid; END IF;
 link:=coalesce(link,'/account/bookings/'||bid);
 INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href,event_key) VALUES(uid,bid,notice,heading,detail,link,event) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER professional_message_notification AFTER INSERT ON beauty.messages FOR EACH ROW EXECUTE FUNCTION beauty.record_professional_source_notification();
CREATE TRIGGER professional_review_notification AFTER INSERT ON beauty.reviews FOR EACH ROW EXECUTE FUNCTION beauty.record_professional_source_notification();
CREATE TRIGGER professional_dispute_notification AFTER INSERT OR UPDATE OF status ON beauty.booking_disputes FOR EACH ROW EXECUTE FUNCTION beauty.record_professional_source_notification();
CREATE TRIGGER professional_refund_appeal_notification AFTER INSERT ON beauty.refund_appeals FOR EACH ROW EXECUTE FUNCTION beauty.record_professional_source_notification();
CREATE TRIGGER professional_booking_refund_notification AFTER INSERT OR UPDATE OF status ON beauty.payments FOR EACH ROW EXECUTE FUNCTION beauty.record_professional_source_notification();
CREATE TRIGGER professional_order_refund_notification AFTER INSERT OR UPDATE OF status ON beauty.product_orders FOR EACH ROW EXECUTE FUNCTION beauty.record_professional_source_notification();
-- Each order is already seller-scoped by the existing paid-order writer.
-- Extend existing booking reminders to the professional using the same calendar.
CREATE FUNCTION beauty.prepare_professional_notifications() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE beauty.notification_outbox n SET sent_at=now(),delivery_status='suppressed',last_error='SUPERSEDED_REMINDER',claimed_until=NULL
 FROM beauty.bookings b WHERE b.id=n.booking_id AND n.kind='reminder' AND n.sent_at IS NULL
 AND n.event_reference LIKE 'professional:%' AND n.event_reference<>'professional:'||b.starts_at::text;

 INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href,event_key)
 SELECT p.user_id,b.id,'booking_reminder','Upcoming appointment',b.service_name||' · '||to_char(b.starts_at AT TIME ZONE 'Europe/London','DD Mon YYYY HH24:MI')||' London time. Open your calendar to prepare.', '/account/bookings/'||b.id,'reminder:'||b.id||':'||b.starts_at::text
 FROM beauty.bookings b JOIN beauty.professional_profiles p ON p.id=b.professional_id
 WHERE b.status='confirmed' AND b.starts_at>now() AND b.starts_at<=now()+interval '24 hours'
 ON CONFLICT DO NOTHING;
 INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id,event_reference)
 SELECT b.id,'reminder',p.user_id,'professional:'||b.starts_at::text FROM beauty.bookings b JOIN beauty.professional_profiles p ON p.id=b.professional_id
 WHERE b.status='confirmed' AND b.starts_at>now() AND b.starts_at<=now()+interval '24 hours' ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION beauty.claim_professional_alert_emails() RETURNS TABLE(id uuid,email text,title text,body text,href text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE beauty.notification_outbox n SET delivery_status='failed',last_error='RETRY_WINDOW_EXPIRED',attempts=greatest(attempts,5)
 WHERE n.kind='professional_alert' AND n.sent_at IS NULL AND n.delivery_status IS DISTINCT FROM 'suppressed'
 AND (n.attempts>=5 OR n.due_at<now()-interval '24 hours' OR n.first_attempt_at<=now()-interval '23 hours') AND (n.claimed_until IS NULL OR n.claimed_until<now());

 RETURN QUERY WITH eligible AS(
 SELECT n.id FROM beauty.notification_outbox n JOIN beauty.in_app_notifications i ON i.id=n.notification_id JOIN beauty.users u ON u.id=n.recipient_user_id
 WHERE n.kind='professional_alert' AND n.delivery_status IS DISTINCT FROM 'suppressed' AND n.sent_at IS NULL AND n.due_at<=now() AND (n.claimed_until IS NULL OR n.claimed_until<now()) AND n.attempts<5 AND (n.first_attempt_at IS NULL OR n.first_attempt_at>now()-interval '23 hours')
 AND u.status='active' AND u.deleted_at IS NULL AND beauty.notification_allowed(u.id,beauty.notification_category(i.kind),'email')
 AND NOT EXISTS(SELECT 1 FROM beauty.email_suppressions s WHERE s.email=lower(u.email)) ORDER BY n.due_at LIMIT 20 FOR UPDATE OF n SKIP LOCKED
 ),claimed AS(UPDATE beauty.notification_outbox n SET attempts=n.attempts+1,first_attempt_at=coalesce(n.first_attempt_at,now()),claimed_until=now()+interval '5 minutes' FROM eligible e WHERE n.id=e.id RETURNING n.*)
 SELECT n.id,u.email,i.title,i.body,i.href FROM claimed n JOIN beauty.users u ON u.id=n.recipient_user_id JOIN beauty.in_app_notifications i ON i.id=n.notification_id;
END $$;
CREATE FUNCTION beauty.claim_push_deliveries() RETURNS TABLE(id uuid,endpoint text,p256dh text,auth text,notification_id uuid,href text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE beauty.push_deliveries d SET status='skipped',claimed_until=NULL FROM beauty.push_subscriptions s,beauty.in_app_notifications i,beauty.users u
 WHERE d.subscription_id=s.id AND d.notification_id=i.id AND u.id=s.user_id AND d.status='pending'
 AND (s.disabled_at IS NOT NULL OR u.status<>'active' OR u.deleted_at IS NOT NULL
 OR (i.kind<>'push_test' AND NOT beauty.notification_allowed(u.id,beauty.notification_category(i.kind),'push'))
 OR (i.kind='booking_reminder' AND NOT EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.id=i.booking_id AND b.status='confirmed' AND b.starts_at>now() AND (i.event_key IS NULL OR i.event_key='reminder:'||b.id||':'||b.starts_at::text))));
 UPDATE beauty.push_deliveries SET status='failed',last_error='RETRY_EXHAUSTED' WHERE status='pending' AND (attempts>=5 OR due_at<now()-interval '24 hours') AND (claimed_until IS NULL OR claimed_until<now());
 RETURN QUERY WITH eligible AS(SELECT d.id FROM beauty.push_deliveries d WHERE d.status='pending' AND d.due_at<=now() AND (d.claimed_until IS NULL OR d.claimed_until<now()) ORDER BY d.due_at LIMIT 30 FOR UPDATE SKIP LOCKED),
 claimed AS(UPDATE beauty.push_deliveries d SET attempts=d.attempts+1,claimed_until=now()+interval '5 minutes' FROM eligible e WHERE d.id=e.id RETURNING d.*)
 SELECT d.id,s.endpoint,s.p256dh,s.auth,d.notification_id,i.href FROM claimed d JOIN beauty.push_subscriptions s ON s.id=d.subscription_id JOIN beauty.in_app_notifications i ON i.id=d.notification_id;
END $$;
CREATE FUNCTION beauty.finish_push_delivery(target uuid,result text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF result NOT IN('accepted','retry','expired','failed') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.push_deliveries SET status=CASE WHEN result='retry' AND attempts<5 THEN 'pending' WHEN result='retry' THEN 'failed' ELSE result END,
 sent_at=CASE WHEN result='accepted' THEN now() ELSE NULL END,claimed_until=NULL,
 due_at=CASE WHEN result='retry' THEN now()+least(60,power(2,attempts)::integer)*interval '1 minute' ELSE due_at END,
 last_error=CASE WHEN result='accepted' THEN NULL ELSE upper(result) END WHERE id=target AND status='pending';
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE beauty.push_subscriptions s SET last_success_at=CASE WHEN result='accepted' THEN now() ELSE last_success_at END,
 disabled_at=CASE WHEN result='expired' THEN now() ELSE disabled_at END,last_error=CASE WHEN result='accepted' THEN NULL ELSE upper(result) END
 FROM beauty.push_deliveries d WHERE d.id=target AND s.id=d.subscription_id;
END $$;
DO $$ DECLARE ddl text; BEGIN
 SELECT pg_get_functiondef('beauty.claim_notifications()'::regprocedure) INTO ddl;
 IF strpos(ddl,'AND n.attempts<5')=0 THEN RAISE EXCEPTION 'BOOKING_NOTIFICATION_CLAIM_REVIEW_REQUIRED'; END IF;
 ddl:=replace(ddl,'AND n.attempts<5', $replacement$AND n.attempts<5
 AND u.status='active' AND u.deleted_at IS NULL
 AND (n.kind<>'reminder' OR n.event_reference NOT LIKE 'professional:%' OR n.event_reference='professional:'||b.starts_at::text)
 AND (n.kind<>'reminder' OR NOT EXISTS(SELECT 1 FROM beauty.professional_profiles pp WHERE pp.id=b.professional_id AND pp.user_id=u.id) OR beauty.notification_allowed(u.id,'reminders','email'))$replacement$);
 EXECUTE ddl;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_notification_ops;
DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname=ANY(ARRAY['notification_actor','notification_category','notification_allowed','my_notification_settings','set_notification_preference','save_push_subscription','disable_push_subscription','test_push_subscription','fanout_professional_notification','record_professional_source_notification','prepare_professional_notifications','claim_professional_alert_emails','claim_push_deliveries','finish_push_delivery']) LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO beauty_notification_ops',f.signature);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker',f.signature);
 END LOOP; END $$;
REVOKE CREATE ON SCHEMA beauty FROM beauty_notification_ops;
GRANT SELECT ON beauty.email_suppressions TO beauty_notification_ops;
CREATE POLICY notification_internal_read ON beauty.email_suppressions FOR SELECT TO beauty_notification_ops USING(true);
GRANT SELECT,INSERT,UPDATE ON beauty.marketing_preferences TO beauty_notification_ops;
CREATE POLICY notification_internal_write ON beauty.marketing_preferences FOR ALL TO beauty_notification_ops USING(true) WITH CHECK(true);
GRANT EXECUTE ON FUNCTION beauty.my_notification_settings(),beauty.set_notification_preference(text,boolean,boolean),beauty.save_push_subscription(text,text,text,text),beauty.disable_push_subscription(uuid),beauty.test_push_subscription(uuid) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.prepare_professional_notifications(),beauty.claim_professional_alert_emails(),beauty.claim_push_deliveries(),beauty.finish_push_delivery(uuid,text) TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.notification_allowed(uuid,text,text) TO beauty_booking_ops;

-- Enrich private professional inbox copy using authoritative booking/order
-- snapshots. No customer message text, contact details or health data copied.
CREATE FUNCTION beauty.enrich_professional_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b beauty.bookings; o beauty.product_orders; BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE user_id=NEW.user_id) THEN RETURN NEW; END IF;
 IF NEW.booking_id IS NOT NULL THEN
  SELECT * INTO b FROM beauty.bookings WHERE id=NEW.booking_id;
  NEW.body:=left(NEW.body||' Reference '||left(b.id::text,8)||' · '||b.service_name||' · '||to_char(b.starts_at AT TIME ZONE 'Europe/London','DD Mon YYYY HH24:MI')||' London time · Booking '||replace(b.status,'_',' ')||'.',500);
 ELSIF NEW.product_order_id IS NOT NULL THEN
  SELECT * INTO o FROM beauty.product_orders WHERE id=NEW.product_order_id;
  NEW.body:=left(NEW.body||' Order '||left(o.id::text,8)||' · £'||to_char(o.total_pence/100.0,'FM999999990.00')||' · '||replace(o.status,'_',' ')||'. View your items and required action in Orders.',500);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER enrich_professional_notification BEFORE INSERT ON beauty.in_app_notifications FOR EACH ROW EXECUTE FUNCTION beauty.enrich_professional_notification();
-- Order disputes are matched per seller to the existing paid order snapshots.
-- This adds notification records only; financial dispute handling is unchanged.
CREATE FUNCTION beauty.notify_product_dispute(intent_ref text,dispute_ref text,dispute_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF dispute_ref NOT LIKE 'dp_%' OR dispute_status NOT IN('warning_needs_response','warning_under_review','needs_response','under_review') THEN RETURN; END IF;
 INSERT INTO beauty.in_app_notifications(user_id,product_order_id,kind,title,body,href,event_key)
 SELECT p.user_id,o.id,'dispute_opened','Shop payment dispute requires review','A payment dispute is open. Review your order and contact GLOHAUS support.','/professional/orders','product-dispute:'||dispute_ref||':'||o.id
 FROM beauty.product_orders o JOIN beauty.professional_profiles p ON p.id=o.professional_id WHERE o.provider_payment_intent_id=intent_ref ON CONFLICT DO NOTHING;
END $$;
-- Campaign dispatch reuses the existing campaign, audience, and marketing
-- consent boundary. Push-only promotion consent is independent of email.
CREATE FUNCTION beauty.prepare_professional_promotions() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href,event_key)
 SELECT p.user_id,'promotion',left(c.subject,120),'A GLOHAUS professional promotion is available. Open your dashboard for details.',
 CASE WHEN c.cta_url ~ '^/[a-zA-Z0-9_/?=&-]*$' AND c.cta_url !~ '^//' THEN c.cta_url ELSE '/professional/tools' END,'campaign:'||c.id
 FROM beauty.marketing_campaigns c CROSS JOIN beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id
 WHERE c.audience='professional' AND c.status IN('queued','sending','sent') AND c.created_at>now()-interval '24 hours'
 AND u.status='active' AND u.deleted_at IS NULL AND beauty.notification_allowed(u.id,'promotions','push') ON CONFLICT DO NOTHING;
END $$;
-- Aggregate-only diagnostics; no subscription secrets, email addresses or
-- private message bodies are exposed to the Owner console.
CREATE FUNCTION beauty.admin_push_delivery_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_admin();
 RETURN jsonb_build_object('activeDevices',(SELECT count(*) FROM beauty.push_subscriptions WHERE disabled_at IS NULL),
 'queued',(SELECT count(*) FROM beauty.push_deliveries WHERE status='pending'),
 'accepted',(SELECT count(*) FROM beauty.push_deliveries WHERE status='accepted'),
 'failed',(SELECT count(*) FROM beauty.push_deliveries WHERE status='failed'),
 'expired',(SELECT count(*) FROM beauty.push_deliveries WHERE status='expired'),
 'skipped',(SELECT count(*) FROM beauty.push_deliveries WHERE status='skipped'),
 'lastAcceptedAt',(SELECT max(sent_at) FROM beauty.push_deliveries));
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_notification_ops;
ALTER FUNCTION beauty.enrich_professional_notification() OWNER TO beauty_notification_ops;
ALTER FUNCTION beauty.notify_product_dispute(text,text,text) OWNER TO beauty_notification_ops;
ALTER FUNCTION beauty.prepare_professional_promotions() OWNER TO beauty_notification_ops;
ALTER FUNCTION beauty.admin_push_delivery_overview() OWNER TO beauty_notification_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_notification_ops;
REVOKE ALL ON FUNCTION beauty.enrich_professional_notification(),beauty.notify_product_dispute(text,text,text),beauty.prepare_professional_promotions(),beauty.admin_push_delivery_overview() FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.notify_product_dispute(text,text,text),beauty.prepare_professional_promotions() TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.require_admin() TO beauty_notification_ops;
GRANT EXECUTE ON FUNCTION beauty.admin_push_delivery_overview() TO beauty_app;
-- Master email promotion opt-out also gates existing fine-grained campaigns,
-- without erasing those preferences. Existing consent remains authoritative.
DO $$ DECLARE ddl text; BEGIN
 SELECT pg_get_functiondef('beauty.claim_marketing_notifications()'::regprocedure) INTO ddl;
 IF strpos(ddl,'AND o.attempts<5')=0 THEN RAISE EXCEPTION 'MARKETING_NOTIFICATION_CLAIM_REVIEW_REQUIRED'; END IF;
 ddl:=replace(ddl,'AND o.attempts<5',$replacement$AND o.attempts<5
 AND NOT EXISTS(SELECT 1 FROM beauty.professional_profiles pp JOIN beauty.notification_preferences np ON np.user_id=pp.user_id WHERE pp.user_id=o.recipient_user_id AND np.category='promotions' AND NOT np.email)$replacement$);
 EXECUTE ddl;
END $$;
GRANT SELECT ON beauty.notification_preferences TO beauty_admin_ops;
CREATE POLICY notification_preferences_marketing_read ON beauty.notification_preferences FOR SELECT TO beauty_admin_ops USING(true);

CREATE FUNCTION beauty.notification_product_summary(target uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT string_agg(product_name||' × '||quantity::text,', ' ORDER BY id) FROM beauty.product_order_items WHERE order_id=target
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_notification_ops;
ALTER FUNCTION beauty.notification_product_summary(uuid) OWNER TO beauty_notification_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_notification_ops;
REVOKE ALL ON FUNCTION beauty.notification_product_summary(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.notification_product_summary(uuid) TO beauty_payment_worker;

-- Preserve booking policy behaviour while giving each update its existing
-- immutable event ID in the inbox as well as the email queue.
CREATE OR REPLACE FUNCTION beauty.notify_policy_booking(target uuid,event uuid,notice_kind text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b beauty.bookings; pro_user uuid; recipient uuid; BEGIN
 SELECT * INTO b FROM beauty.bookings WHERE id=target; SELECT user_id INTO pro_user FROM beauty.professional_profiles WHERE id=b.professional_id;
 FOREACH recipient IN ARRAY ARRAY[b.customer_id,pro_user] LOOP
  INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id,event_reference) VALUES(target,notice_kind,recipient,event::text) ON CONFLICT DO NOTHING;
  INSERT INTO beauty.in_app_notifications(user_id,booking_id,kind,title,body,href,event_key)
  VALUES(recipient,target,'booking_policy_update','Your appointment has an update','Open your appointment to review its timing, preparation or arrival update. No charge was created by this update.','/account/bookings/'||target::text,'policy:'||event) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
GRANT INSERT(event_key) ON beauty.in_app_notifications TO beauty_booking_ops;

-- Existing terminal-queue cleanup must recognize both the established policy
-- kinds and the new generic professional kind; keep the financial maintenance
-- body and original eligibility for every other notification unchanged.
DO $$ DECLARE ddl text; anchor text:=$anchor$OR (n.kind='review_request' AND b.status='completed')$anchor$; BEGIN
 SELECT pg_get_functiondef('beauty.run_scheduled_maintenance()'::regprocedure) INTO ddl;
 IF strpos(ddl,anchor)=0 THEN RAISE EXCEPTION 'NOTIFICATION_MAINTENANCE_REVIEW_REQUIRED'; END IF;
 ddl:=replace(ddl,anchor,anchor||$extra$
          OR n.kind IN('rescheduled','late_notice','requirements_update','professional_alert')$extra$);
 EXECUTE ddl;
END $$;

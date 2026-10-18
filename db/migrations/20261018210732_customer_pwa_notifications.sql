-- Extend the existing inbox, preferences, subscriptions and delivery worker.
-- This migration is prepared for review; do not apply before release approval.
CREATE FUNCTION beauty.customer_notification_actor() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE uid uuid; BEGIN
 SELECT u.id INTO uid FROM beauty.users u WHERE u.auth_id=beauty.auth_id()
 AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())
 AND EXISTS(SELECT 1 FROM beauty.user_roles r WHERE r.user_id=u.id AND r.role='customer');
 IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; RETURN uid;
END $$;
CREATE FUNCTION beauty.customer_notification_settings() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.customer_notification_actor(); BEGIN
 RETURN jsonb_build_object('preferences',(SELECT jsonb_agg(jsonb_build_object('category',c,'email',true,'push',beauty.notification_allowed(uid,c,'push'))) FROM unnest(ARRAY['bookings','orders','changes','messages','reminders']) c),
 'devices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'created_at',created_at,'last_success_at',last_success_at,'disabled_at',disabled_at) ORDER BY created_at DESC),'[]'::jsonb) FROM beauty.push_subscriptions WHERE user_id=uid));
END $$;
CREATE FUNCTION beauty.set_customer_push_preference(category text,enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.customer_notification_actor(); BEGIN
 IF category NOT IN('bookings','orders','changes','messages','reminders') OR category IS NULL OR enabled IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 -- Only push changes. Existing transactional/marketing email choices are preserved.
 INSERT INTO beauty.notification_preferences(user_id,category,email,push) VALUES(uid,category,true,enabled)
 ON CONFLICT ON CONSTRAINT notification_preferences_pkey DO UPDATE SET push=excluded.push,updated_at=now();
 IF NOT enabled THEN UPDATE beauty.push_deliveries d SET status='skipped',claimed_until=NULL
 FROM beauty.in_app_notifications i WHERE d.notification_id=i.id AND i.user_id=uid AND d.status='pending' AND i.kind<>'push_test' AND beauty.notification_category(i.kind)=set_customer_push_preference.category; END IF;
END $$;
CREATE FUNCTION beauty.save_customer_push_subscription(endpoint text,p256dh text,auth text,label text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.customer_notification_actor(); result uuid; BEGIN
 IF endpoint IS NULL OR length(endpoint)>2048 OR endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-zA-Z0-9.-]+\.push\.apple\.com|[a-zA-Z0-9.-]+\.notify\.windows\.com|wns\.windows\.com)/'
 OR p256dh IS NULL OR p256dh !~ '^[A-Za-z0-9_-]{87}=?$' OR auth IS NULL OR auth !~ '^[A-Za-z0-9_-]{22}={0,2}$' OR label IS NULL OR length(trim(label)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,6101821));
 IF (SELECT count(*) FROM beauty.push_subscriptions WHERE user_id=uid AND disabled_at IS NULL AND push_subscriptions.endpoint<>save_customer_push_subscription.endpoint)>=10 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.push_subscriptions(user_id,endpoint,p256dh,auth,label) VALUES(uid,endpoint,p256dh,auth,label)
 ON CONFLICT ON CONSTRAINT push_subscriptions_endpoint_key DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,label=excluded.label,disabled_at=NULL,last_error=NULL WHERE push_subscriptions.user_id=uid RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; RETURN result;
END $$;
CREATE FUNCTION beauty.customer_push_action(target uuid,action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.customer_notification_actor(); nid uuid; BEGIN
 IF action NOT IN('disable','test') OR action IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,6101821));
 IF NOT EXISTS(SELECT 1 FROM beauty.push_subscriptions WHERE id=target AND user_id=uid AND disabled_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF action='disable' THEN UPDATE beauty.push_subscriptions SET disabled_at=now() WHERE id=target AND user_id=uid; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM beauty.in_app_notifications WHERE user_id=uid AND kind='push_test' AND created_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href) VALUES(uid,'push_test','Push test requested','This is your requested device notification test.','/account/notifications') RETURNING id INTO nid;
 INSERT INTO beauty.push_deliveries(notification_id,subscription_id) VALUES(nid,target) ON CONFLICT DO NOTHING;
END $$;

-- Add the missing customer-side message event without copying message contents.
ALTER TABLE beauty.in_app_notifications DROP CONSTRAINT in_app_notifications_kind_check;
ALTER TABLE beauty.in_app_notifications ADD CHECK(kind IN('booking_created','booking_confirmed','booking_cancelled','appointment_completed','booking_reminder','order_paid','order_processing','order_shipped','order_delivered','order_refund_pending','order_refunded','order_shipping_reminder','commission_changed','booking_policy_update','professional_policy_review','professional_activity','customer_message','professional_message','review_received','dispute_opened','refund_requested','push_test','promotion','order_cancelled','arrival_update','journey_departure'));
CREATE OR REPLACE FUNCTION beauty.notification_category(kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN kind='booking_confirmed' THEN 'bookings'
 WHEN kind IN('booking_cancelled','booking_policy_update','dispute_opened','refund_requested','arrival_update') THEN 'changes'
 WHEN kind IN('booking_reminder','journey_departure') THEN 'reminders' WHEN kind IN('customer_message','professional_message') THEN 'messages'
 WHEN kind='review_received' THEN 'reviews' WHEN kind='promotion' THEN 'promotions'
 WHEN kind LIKE 'order_%' THEN 'orders' ELSE 'critical' END
$$;
CREATE FUNCTION beauty.record_customer_message_notice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid; BEGIN
 IF NEW.sender_role<>'professional' THEN RETURN NEW; END IF;
 SELECT c.customer_id INTO uid FROM beauty.conversations c JOIN beauty.professional_profiles p ON p.id=c.professional_id
 WHERE c.id=NEW.conversation_id AND p.user_id=NEW.sender_user_id;
 IF uid IS NULL THEN RETURN NEW; END IF;
 INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href,event_key)
 VALUES(uid,'professional_message','New message from your professional','Your professional sent you a private message. Open your inbox to reply.','/messages?thread='||NEW.conversation_id,'customer-message:'||NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_message_notice AFTER INSERT ON beauty.messages FOR EACH ROW EXECUTE FUNCTION beauty.record_customer_message_notice();
-- Extend the existing customer fan-out trigger; no second worker or duplicate inbox.
CREATE OR REPLACE FUNCTION beauty.fanout_customer_arrival() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.kind IN('booking_confirmed','booking_cancelled','booking_reminder','booking_policy_update','professional_message','order_paid','order_processing','order_shipped','order_delivered','order_refund_pending','order_refunded','order_cancelled','arrival_update','journey_departure')
 AND EXISTS(SELECT 1 FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer' WHERE u.id=NEW.user_id AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now()))
 AND NOT EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.user_id=NEW.user_id)
 AND beauty.notification_allowed(NEW.user_id,beauty.notification_category(NEW.kind),'push') THEN
  INSERT INTO beauty.push_deliveries(notification_id,subscription_id) SELECT NEW.id,s.id FROM beauty.push_subscriptions s WHERE s.user_id=NEW.user_id AND s.disabled_at IS NULL ON CONFLICT DO NOTHING;
 END IF; RETURN NEW;
END $$;
-- Preserve prior explicit appointment-push consent, including dual-role accounts.
INSERT INTO beauty.notification_preferences(user_id,category,email,push)
 SELECT DISTINCT s.user_id,c,true,true FROM beauty.push_subscriptions s CROSS JOIN unnest(ARRAY['changes','reminders']) c
 WHERE s.disabled_at IS NULL AND s.label='Customer journey reminders' ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION beauty.save_customer_journey_push(target uuid,endpoint text,p256dh text,auth text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=beauty.customer_notification_actor(); result uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.id=target AND b.customer_id=uid AND b.status='confirmed') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 result:=beauty.save_customer_push_subscription(endpoint,p256dh,auth,'Customer journey reminders');
 INSERT INTO beauty.notification_preferences(user_id,category,email,push) SELECT uid,c,true,true FROM unnest(ARRAY['changes','reminders']) c ON CONFLICT DO NOTHING;
 RETURN result;
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_notification_ops;
DO $$ DECLARE sig regprocedure; BEGIN
 FOREACH sig IN ARRAY ARRAY['beauty.customer_notification_actor()'::regprocedure,'beauty.customer_notification_settings()'::regprocedure,'beauty.set_customer_push_preference(text,boolean)'::regprocedure,'beauty.save_customer_push_subscription(text,text,text,text)'::regprocedure,'beauty.customer_push_action(uuid,text)'::regprocedure,'beauty.record_customer_message_notice()'::regprocedure] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO beauty_notification_ops',sig);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,beauty_app',sig);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA beauty FROM beauty_notification_ops;
GRANT EXECUTE ON FUNCTION beauty.customer_notification_settings(),beauty.set_customer_push_preference(text,boolean),beauty.save_customer_push_subscription(text,text,text,text),beauty.customer_push_action(uuid,text) TO beauty_app;

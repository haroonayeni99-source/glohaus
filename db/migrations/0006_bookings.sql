CREATE ROLE beauty_booking_ops NOLOGIN NOSUPERUSER NOBYPASSRLS;
-- Required only for the Supabase postgres migration owner to transfer the
-- booking-operation functions below.
GRANT beauty_booking_ops TO postgres;
CREATE ROLE beauty_payment_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA beauty TO beauty_booking_ops,beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_booking_ops;
CREATE TABLE beauty.professional_payment_accounts (
 professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),stripe_account_id text UNIQUE NOT NULL CHECK(stripe_account_id LIKE 'acct_%'),charges_enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE beauty.bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),customer_id uuid NOT NULL REFERENCES beauty.users(id),service_id uuid NOT NULL,
 service_name text NOT NULL,customer_name text NOT NULL,professional_name text NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,duration_minutes integer NOT NULL,
 price_pence integer NOT NULL CHECK(price_pence>0),deposit_pence integer NOT NULL CHECK(deposit_pence>=0 AND deposit_pence<=price_pence),currency text NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
 status text NOT NULL CHECK(status IN('payment_pending','confirmed','cancelled','completed','no_show','expired')),
 hold_expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),cancelled_at timestamptz, cancellation_actor text CHECK(cancellation_actor IN('customer','professional')),
 cancellation_reason text CHECK(length(cancellation_reason)<=500),cancellation_policy_version text NOT NULL DEFAULT 'england-24h-v1',completed_at timestamptz,
 FOREIGN KEY(service_id,professional_id) REFERENCES beauty.services(id,professional_id),CHECK(ends_at=starts_at+duration_minutes*interval '1 minute')
);
CREATE INDEX bookings_professional_time ON beauty.bookings(professional_id,starts_at,ends_at);
CREATE INDEX bookings_customer ON beauty.bookings(customer_id,created_at DESC);
CREATE TABLE beauty.payments (
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id),stripe_session_id text UNIQUE,stripe_payment_intent_id text UNIQUE,
 captured_pence integer NOT NULL DEFAULT 0 CHECK(captured_pence>=0),refunded_pence integer NOT NULL DEFAULT 0 CHECK(refunded_pence>=0 AND refunded_pence<=captured_pence),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','paid','refund_required','partially_refunded','refunded')),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.payment_events(event_id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE beauty.notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES beauty.bookings(id),kind text NOT NULL CHECK(kind IN('confirmation','cancellation','reminder','review_request')),
 recipient_user_id uuid NOT NULL REFERENCES beauty.users(id),due_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,attempts integer NOT NULL DEFAULT 0,last_error text,
 UNIQUE(booking_id,kind,recipient_user_id)
);
CREATE INDEX outbox_due ON beauty.notification_outbox(due_at) WHERE sent_at IS NULL;
ALTER TABLE beauty.professional_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_payment_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.notification_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY connect_owner ON beauty.professional_payment_accounts FOR SELECT TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE POLICY connect_owner_create ON beauty.professional_payment_accounts FOR INSERT TO beauty_app WITH CHECK(NOT charges_enabled AND EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
GRANT SELECT ON beauty.professional_payment_accounts TO beauty_app;
GRANT INSERT(professional_id,stripe_account_id) ON beauty.professional_payment_accounts TO beauty_app;
CREATE POLICY booking_participant ON beauty.bookings FOR SELECT TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=customer_id AND u.auth_id=beauty.auth_id() AND u.status='active') OR EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE POLICY payment_participant ON beauty.payments FOR SELECT TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.id=booking_id));
GRANT SELECT ON beauty.bookings,beauty.payments TO beauty_app;
-- Only function-owning roles can mutate bookings, funds and outbox rows.
GRANT SELECT ON beauty.users,beauty.user_roles,beauty.professional_profiles,beauty.services,beauty.availability_rules,beauty.availability_blocks TO beauty_booking_ops;
CREATE POLICY booking_ops_users ON beauty.users FOR SELECT TO beauty_booking_ops USING(true);
CREATE POLICY booking_ops_roles ON beauty.user_roles FOR SELECT TO beauty_booking_ops USING(true);
CREATE POLICY booking_ops_profiles ON beauty.professional_profiles FOR SELECT TO beauty_booking_ops USING(true);
CREATE POLICY booking_ops_services ON beauty.services FOR SELECT TO beauty_booking_ops USING(true);
CREATE POLICY booking_ops_rules ON beauty.availability_rules FOR SELECT TO beauty_booking_ops USING(true);
CREATE POLICY booking_ops_blocks ON beauty.availability_blocks FOR SELECT TO beauty_booking_ops USING(true);
GRANT SELECT,INSERT,UPDATE ON beauty.bookings,beauty.payments,beauty.professional_payment_accounts,beauty.notification_outbox TO beauty_booking_ops;
GRANT SELECT,INSERT ON beauty.payment_events TO beauty_booking_ops;
CREATE POLICY booking_ops_bookings ON beauty.bookings FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true);
CREATE POLICY booking_ops_payments ON beauty.payments FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true);
CREATE POLICY booking_ops_connect ON beauty.professional_payment_accounts FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true);
CREATE POLICY booking_ops_outbox ON beauty.notification_outbox FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true);
CREATE POLICY booking_ops_events ON beauty.payment_events FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.booking_busy(target uuid,day_start timestamptz,day_end timestamptz) RETURNS TABLE(starts_at timestamptz,ends_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF day_end<=day_start OR day_end-day_start>interval '3 days' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=target AND p.publication_status='published' AND u.status='active') THEN RETURN;END IF;
 RETURN QUERY SELECT b.starts_at,b.ends_at FROM beauty.bookings b WHERE b.professional_id=target AND b.starts_at<day_end AND b.ends_at>day_start AND (b.status='confirmed' OR(b.status='payment_pending' AND b.hold_expires_at>now()))
 UNION ALL SELECT a.starts_at,a.ends_at FROM beauty.availability_blocks a WHERE a.professional_id=target AND a.starts_at<day_end AND a.ends_at>day_start;
END $$;
CREATE FUNCTION beauty.reserve_booking(target_service uuid,target_start timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE customer beauty.users;service beauty.services;professional beauty.professional_profiles;finish timestamptz;local_start timestamp;local_end timestamp;rule beauty.availability_rules;result beauty.bookings;instant timestamptz;
BEGIN
 SELECT u.* INTO customer FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND r.role='customer';
 IF customer.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO service FROM beauty.services WHERE id=target_service AND active;
 SELECT p.* INTO professional FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=service.professional_id AND p.publication_status='published' AND u.status='active';
 IF professional.id IS NULL OR professional.user_id=customer.id THEN RAISE EXCEPTION 'UNAVAILABLE_SERVICE' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM beauty.professional_payment_accounts WHERE professional_id=professional.id AND charges_enabled) THEN RAISE EXCEPTION 'PAYMENTS_NOT_READY' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(professional.id::text,0));
 IF target_start IS NULL OR target_start<now()+interval '1 hour' OR target_start>now()+interval '90 days' OR extract(epoch FROM target_start)%900<>0 THEN RAISE EXCEPTION 'INVALID_TIME' USING ERRCODE='22023';END IF;
 finish:=target_start+service.duration_minutes*interval '1 minute';local_start:=target_start AT TIME ZONE 'Europe/London';local_end:=finish AT TIME ZONE 'Europe/London';
 SELECT * INTO rule FROM beauty.availability_rules WHERE professional_id=professional.id AND weekday=extract(dow FROM local_start);
 IF rule.id IS NULL OR (local_end::date<>local_start::date AND NOT(local_end::date=local_start::date+1 AND local_end::time='00:00' AND rule.end_minute=1440)) THEN RAISE EXCEPTION 'OUTSIDE_HOURS' USING ERRCODE='22023';END IF;
 FOR instant IN SELECT generate_series(target_start,finish-interval '1 second',interval '15 minutes') LOOP
 IF extract(hour FROM instant AT TIME ZONE 'Europe/London')*60+extract(minute FROM instant AT TIME ZONE 'Europe/London') NOT BETWEEN rule.start_minute AND rule.end_minute-1 THEN RAISE EXCEPTION 'OUTSIDE_HOURS' USING ERRCODE='22023';END IF;
 END LOOP;
 IF local_end::date=local_start::date AND extract(hour FROM local_end)*60+extract(minute FROM local_end)>rule.end_minute THEN RAISE EXCEPTION 'OUTSIDE_HOURS' USING ERRCODE='22023';END IF;
 UPDATE beauty.bookings SET status='expired' WHERE professional_id=professional.id AND status='payment_pending' AND hold_expires_at<=now();
 SELECT * INTO result FROM beauty.bookings WHERE professional_id=professional.id AND customer_id=customer.id AND service_id=service.id AND starts_at=target_start AND status='payment_pending' AND hold_expires_at>now() LIMIT 1;
 IF result.id IS NOT NULL THEN RETURN jsonb_build_object('id',result.id,'depositPence',result.deposit_pence,'serviceName',result.service_name,'professionalName',result.professional_name,'status',result.status,'holdExpiresAt',result.hold_expires_at,'stripeAccountId',(SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=professional.id));END IF;
 IF EXISTS(SELECT 1 FROM beauty.bookings WHERE professional_id=professional.id AND status IN('confirmed','payment_pending') AND starts_at<finish AND ends_at>target_start) OR EXISTS(SELECT 1 FROM beauty.availability_blocks WHERE professional_id=professional.id AND starts_at<finish AND ends_at>target_start) THEN RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE='23P01';END IF;
 IF (SELECT count(*) FROM beauty.bookings WHERE customer_id=customer.id AND created_at>now()-interval '1 hour')>=10 THEN RAISE EXCEPTION 'TOO_MANY_ATTEMPTS' USING ERRCODE='22023';END IF;
 INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at)
 VALUES(professional.id,customer.id,service.id,service.name,customer.display_name,professional.business_name,target_start,finish,service.duration_minutes,service.price_pence,service.deposit_pence,CASE WHEN service.deposit_pence=0 THEN 'confirmed' ELSE 'payment_pending' END,now()+interval '35 minutes') RETURNING * INTO result;
 INSERT INTO beauty.payments(booking_id,status) VALUES(result.id,CASE WHEN service.deposit_pence=0 THEN 'paid' ELSE 'pending' END);
 IF service.deposit_pence=0 THEN PERFORM beauty.enqueue_booking_notifications(result.id,'confirmation');END IF;
 RETURN jsonb_build_object('id',result.id,'depositPence',result.deposit_pence,'serviceName',result.service_name,'professionalName',result.professional_name,'status',result.status,'holdExpiresAt',result.hold_expires_at,'stripeAccountId',(SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=professional.id));
END $$;
CREATE FUNCTION beauty.enqueue_booking_notifications(target uuid,event_kind text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id) SELECT b.id,event_kind,b.customer_id FROM beauty.bookings b WHERE b.id=target ON CONFLICT DO NOTHING;
 INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id) SELECT b.id,event_kind,p.user_id FROM beauty.bookings b JOIN beauty.professional_profiles p ON p.id=b.professional_id WHERE b.id=target ON CONFLICT DO NOTHING;
 IF event_kind='confirmation' THEN
 INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id,due_at) SELECT b.id,'reminder',b.customer_id,greatest(now(),b.starts_at-interval '24 hours') FROM beauty.bookings b WHERE b.id=target ON CONFLICT DO NOTHING;
 END IF;
END $$;
CREATE FUNCTION beauty.attach_checkout(target uuid,session_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.users u ON u.id=b.customer_id WHERE b.id=target AND u.auth_id=beauty.auth_id() AND u.status='active' AND b.status='payment_pending') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 UPDATE beauty.payments SET stripe_session_id=session_id WHERE booking_id=target AND (stripe_session_id IS NULL OR stripe_session_id=session_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'CHECKOUT_CONFLICT' USING ERRCODE='22023';END IF;
END $$;
CREATE FUNCTION beauty.apply_checkout_payment(event_ref text,target uuid,session_ref text,intent_ref text,amount integer,currency_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE booking beauty.bookings;payment beauty.payments;
BEGIN
 IF EXISTS(SELECT 1 FROM beauty.payment_events WHERE event_id=event_ref) THEN RETURN;END IF;
 SELECT * INTO booking FROM beauty.bookings WHERE id=target;
 IF booking.id IS NULL THEN RAISE EXCEPTION 'UNKNOWN_BOOKING' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(booking.professional_id::text,0));
 SELECT * INTO booking FROM beauty.bookings WHERE id=target FOR UPDATE;
 SELECT * INTO payment FROM beauty.payments WHERE booking_id=target FOR UPDATE;
 IF payment.stripe_session_id IS DISTINCT FROM session_ref OR amount IS DISTINCT FROM booking.deposit_pence OR currency_code IS DISTINCT FROM 'gbp' OR intent_ref IS NULL THEN RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE='22023';END IF;
 IF payment.captured_pence>0 THEN
 IF payment.stripe_payment_intent_id IS DISTINCT FROM intent_ref THEN RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE='22023';END IF;
 ELSE
 UPDATE beauty.payments SET captured_pence=amount,stripe_payment_intent_id=intent_ref,status=CASE WHEN booking.status='payment_pending' AND booking.hold_expires_at>now() THEN 'paid' ELSE 'refund_required' END,updated_at=now() WHERE booking_id=target;
 IF booking.status='payment_pending' AND booking.hold_expires_at>now() THEN UPDATE beauty.bookings SET status='confirmed' WHERE id=target;PERFORM beauty.enqueue_booking_notifications(target,'confirmation');END IF;
 END IF;
 INSERT INTO beauty.payment_events(event_id) VALUES(event_ref) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION beauty.sync_connect_account(account_ref text,enabled boolean) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$UPDATE beauty.professional_payment_accounts SET charges_enabled=enabled WHERE stripe_account_id=account_ref$$;
CREATE FUNCTION beauty.change_booking(target uuid,next_status text,reason text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE booking beauty.bookings;actor beauty.users;is_pro boolean;
BEGIN
 SELECT * INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';SELECT * INTO booking FROM beauty.bookings WHERE id=target FOR UPDATE;
 is_pro:=EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=booking.professional_id AND user_id=actor.id);
 IF actor.id IS NULL OR booking.id IS NULL OR (actor.id<>booking.customer_id AND NOT is_pro) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF next_status='cancelled' AND booking.status IN('payment_pending','confirmed') AND length(trim(reason)) BETWEEN 5 AND 500 THEN
 UPDATE beauty.bookings SET status='cancelled',cancelled_at=now(),cancellation_actor=CASE WHEN is_pro THEN 'professional' ELSE 'customer' END,cancellation_reason=trim(reason) WHERE id=target;
 UPDATE beauty.payments SET status='refund_required' WHERE booking_id=target AND captured_pence>refunded_pence;
 PERFORM beauty.enqueue_booking_notifications(target,'cancellation');
 ELSIF is_pro AND next_status IN('completed','no_show') AND booking.status='confirmed' AND booking.ends_at<=now() THEN
 UPDATE beauty.bookings SET status=next_status,completed_at=CASE WHEN next_status='completed' THEN now() ELSE NULL END WHERE id=target;
 IF next_status='completed' THEN INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id,due_at) VALUES(target,'review_request',booking.customer_id,now()+interval '1 hour') ON CONFLICT DO NOTHING;END IF;
 ELSE RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023';END IF;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.booking_busy(uuid,timestamptz,timestamptz) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.reserve_booking(uuid,timestamptz) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.enqueue_booking_notifications(uuid,text) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.attach_checkout(uuid,text) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.apply_checkout_payment(text,uuid,text,text,integer,text) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.sync_connect_account(text,boolean) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.change_booking(uuid,text,text) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.booking_busy(uuid,timestamptz,timestamptz),beauty.reserve_booking(uuid,timestamptz),beauty.enqueue_booking_notifications(uuid,text),beauty.attach_checkout(uuid,text),beauty.apply_checkout_payment(text,uuid,text,text,integer,text),beauty.sync_connect_account(text,boolean),beauty.change_booking(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.booking_busy(uuid,timestamptz,timestamptz),beauty.reserve_booking(uuid,timestamptz),beauty.attach_checkout(uuid,text),beauty.change_booking(uuid,text,text) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.apply_checkout_payment(text,uuid,text,text,integer,text),beauty.sync_connect_account(text,boolean) TO beauty_payment_worker;

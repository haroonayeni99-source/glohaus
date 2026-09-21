-- Zero-deposit appointments do not require a payment provider.
-- Keep immutable price snapshots, ownership checks, slot locking and retry safety.
CREATE OR REPLACE FUNCTION beauty.reserve_booking(target_service uuid,target_start timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE customer beauty.users;service beauty.services;professional beauty.professional_profiles;finish timestamptz;local_start timestamp;local_end timestamp;rule beauty.availability_rules;result beauty.bookings;instant timestamptz;
BEGIN
 SELECT u.* INTO customer FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND r.role='customer';
 IF customer.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO service FROM beauty.services WHERE id=target_service AND active;
 SELECT p.* INTO professional FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=service.professional_id AND p.publication_status='published' AND u.status='active';
 IF professional.id IS NULL OR professional.user_id=customer.id THEN RAISE EXCEPTION 'UNAVAILABLE_SERVICE' USING ERRCODE='22023';END IF;
 IF service.deposit_pence>0 AND NOT EXISTS(SELECT 1 FROM beauty.professional_payment_accounts WHERE professional_id=professional.id AND charges_enabled) THEN RAISE EXCEPTION 'PAYMENTS_NOT_READY' USING ERRCODE='22023';END IF;
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
 SELECT * INTO result FROM beauty.bookings WHERE professional_id=professional.id AND customer_id=customer.id AND service_id=service.id AND starts_at=target_start AND (status='confirmed' OR (status='payment_pending' AND hold_expires_at>now())) LIMIT 1;
 IF result.id IS NOT NULL THEN RETURN jsonb_build_object('id',result.id,'depositPence',result.deposit_pence,'serviceName',result.service_name,'professionalName',result.professional_name,'status',result.status,'holdExpiresAt',result.hold_expires_at,'stripeAccountId',(SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=professional.id));END IF;
 IF EXISTS(SELECT 1 FROM beauty.bookings WHERE professional_id=professional.id AND status IN('confirmed','payment_pending') AND starts_at<finish AND ends_at>target_start) OR EXISTS(SELECT 1 FROM beauty.availability_blocks WHERE professional_id=professional.id AND starts_at<finish AND ends_at>target_start) THEN RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE='23P01';END IF;
 IF (SELECT count(*) FROM beauty.bookings WHERE customer_id=customer.id AND created_at>now()-interval '1 hour')>=10 THEN RAISE EXCEPTION 'TOO_MANY_ATTEMPTS' USING ERRCODE='22023';END IF;
 INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at)
 VALUES(professional.id,customer.id,service.id,service.name,customer.display_name,professional.business_name,target_start,finish,service.duration_minutes,service.price_pence,service.deposit_pence,CASE WHEN service.deposit_pence=0 THEN 'confirmed' ELSE 'payment_pending' END,now()+interval '35 minutes') RETURNING * INTO result;
 INSERT INTO beauty.payments(booking_id,status) VALUES(result.id,CASE WHEN service.deposit_pence=0 THEN 'paid' ELSE 'pending' END);
 IF service.deposit_pence=0 THEN PERFORM beauty.enqueue_booking_notifications(result.id,'confirmation');END IF;
 RETURN jsonb_build_object('id',result.id,'depositPence',result.deposit_pence,'serviceName',result.service_name,'professionalName',result.professional_name,'status',result.status,'holdExpiresAt',result.hold_expires_at,'stripeAccountId',(SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=professional.id));
END $$;

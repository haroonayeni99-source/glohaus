ALTER TABLE beauty.notification_outbox ADD COLUMN claimed_until timestamptz,ADD COLUMN first_attempt_at timestamptz;
CREATE FUNCTION beauty.claim_notifications() RETURNS TABLE(id uuid,booking_id uuid,kind text,email text,service_name text,professional_name text,starts_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN QUERY WITH eligible AS(SELECT n.id FROM beauty.notification_outbox n JOIN beauty.bookings b ON b.id=n.booking_id WHERE n.sent_at IS NULL AND n.due_at<=now() AND(n.claimed_until IS NULL OR n.claimed_until<now()) AND n.attempts<5 AND(n.first_attempt_at IS NULL OR n.first_attempt_at>now()-interval '23 hours') AND ((n.kind='confirmation' AND b.status IN('confirmed','completed')) OR(n.kind='cancellation' AND b.status='cancelled') OR(n.kind='reminder' AND b.status='confirmed' AND b.starts_at>now()) OR(n.kind='review_request' AND b.status='completed')) ORDER BY n.due_at LIMIT 20 FOR UPDATE OF n SKIP LOCKED),claimed AS(UPDATE beauty.notification_outbox n SET claimed_until=now()+interval '5 minutes',attempts=n.attempts+1,first_attempt_at=coalesce(n.first_attempt_at,now()) FROM eligible WHERE n.id=eligible.id RETURNING n.*)
 SELECT n.id,n.booking_id,n.kind,u.email,b.service_name,b.professional_name,b.starts_at FROM claimed n JOIN beauty.users u ON u.id=n.recipient_user_id JOIN beauty.bookings b ON b.id=n.booking_id;
END $$;
CREATE FUNCTION beauty.finish_notification(target uuid,succeeded boolean) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE beauty.notification_outbox SET sent_at=CASE WHEN succeeded THEN now() ELSE sent_at END,claimed_until=NULL,due_at=CASE WHEN succeeded THEN due_at ELSE now()+interval '15 minutes' END,last_error=CASE WHEN succeeded THEN NULL ELSE 'DELIVERY_FAILED' END WHERE id=target AND sent_at IS NULL;
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.claim_notifications() OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.finish_notification(uuid,boolean) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.claim_notifications(),beauty.finish_notification(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.claim_notifications(),beauty.finish_notification(uuid,boolean) TO beauty_payment_worker;

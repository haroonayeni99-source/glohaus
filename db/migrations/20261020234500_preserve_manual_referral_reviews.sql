-- Manual Owner case decisions must not be undone by the automated qualification refresh.
CREATE OR REPLACE FUNCTION beauty.owner_refresh_referral_audit()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE total integer;
BEGIN
 PERFORM beauty.require_owner();
 WITH evaluated AS (
 SELECT r.id AS referral_id,
 CASE WHEN r.referrer_user_id=r.referred_user_id THEN 'rejected'
 WHEN EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
 WHERE b.customer_id=r.referred_user_id AND b.status='completed'
 AND p.captured_pence>p.refunded_pence AND p.captured_pence>0)
 THEN 'qualified' ELSE 'pending' END AS next_status,
 CASE WHEN r.referrer_user_id=r.referred_user_id THEN 'SELF_REFERRAL'
 WHEN EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
 WHERE b.customer_id=r.referred_user_id AND b.status='completed'
 AND p.captured_pence>p.refunded_pence AND p.captured_pence>0)
 THEN 'COMPLETED_PAID_BOOKING' ELSE 'AWAITING_PAID_BOOKING' END AS reason_code
 FROM beauty.customer_referrals r
 WHERE NOT EXISTS (SELECT 1 FROM beauty.growth_referral_review_cases c
 WHERE c.referral_id=r.id AND c.status IN ('open','under_review','rejected'))
 ), next_state AS (
 SELECT e.*,prev.new_status AS previous FROM evaluated e
 LEFT JOIN LATERAL (SELECT a.new_status FROM beauty.growth_referral_audit a
 WHERE a.referral_kind='customer' AND a.referral_id=e.referral_id ORDER BY a.occurred_at DESC,a.id DESC LIMIT 1) prev ON true
 WHERE prev.new_status IS DISTINCT FROM e.next_status
 ), inserted AS (
 INSERT INTO beauty.growth_referral_audit(referral_kind,referral_id,old_status,new_status,reason_code,idempotency_key)
 SELECT 'customer',referral_id,previous,next_status,reason_code,
 'qualification:'||referral_id::text||':'||next_status||':'||coalesce(previous,'initial')
 FROM next_state ON CONFLICT(idempotency_key) DO NOTHING RETURNING id
 ) SELECT count(*) INTO total FROM inserted;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_refresh_referral_audit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_refresh_referral_audit() TO beauty_app;

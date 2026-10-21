-- Scoped automatic reconciler: runs from trusted database payment/booking/referral events.
-- No transfer, payout, customer status change, or automatic reward.
CREATE OR REPLACE FUNCTION beauty.growth_reconcile_customer(target_customer uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ref_id uuid; next_status text; old_status text; reason text; added integer;
BEGIN
 IF target_customer IS NULL THEN RETURN; END IF;
 -- Remove links whenever completion, payment or dispute eligibility no longer holds.
 DELETE FROM beauty.growth_booking_attribution a USING beauty.bookings b
 WHERE a.booking_id=b.id AND b.customer_id=target_customer
 AND (b.status<>'completed' OR b.completed_at IS NULL
 OR EXISTS(SELECT 1 FROM beauty.booking_disputes d WHERE d.booking_id=b.id)
 OR NOT EXISTS (SELECT 1 FROM beauty.payments p WHERE p.booking_id=b.id
 AND p.captured_pence>0 AND p.refunded_pence=0));
 -- Only attribute verified paid completed, non-disputed bookings to a prior explicit consent.
 INSERT INTO beauty.growth_booking_attribution(booking_id,view_id)
 SELECT DISTINCT ON (b.id) b.id,v.id
 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
 JOIN beauty.growth_profile_attribution v ON v.customer_id=b.customer_id AND v.professional_id=b.professional_id
 WHERE b.customer_id=target_customer AND b.status='completed' AND b.completed_at IS NOT NULL
 AND p.captured_pence>0 AND p.refunded_pence=0
 AND NOT EXISTS(SELECT 1 FROM beauty.booking_disputes d WHERE d.booking_id=b.id)
 AND v.viewed_at<=b.created_at AND b.created_at<v.expires_at
 ORDER BY b.id,v.viewed_at DESC
 ON CONFLICT(booking_id) DO NOTHING;

 FOR ref_id IN SELECT r.id FROM beauty.customer_referrals r WHERE r.referred_user_id=target_customer LOOP
  -- Auto flags are review-only and do not establish fraud.
  INSERT INTO beauty.growth_referral_review_cases(referral_id,reason_code)
  SELECT ref_id,'SELF_REFERRAL' WHERE EXISTS
   (SELECT 1 FROM beauty.customer_referrals r WHERE r.id=ref_id AND r.referred_user_id=r.referrer_user_id)
  ON CONFLICT(referral_id,reason_code) DO NOTHING;
  INSERT INTO beauty.growth_referral_review_cases(referral_id,reason_code)
  SELECT ref_id,'REFERRAL_BOOKING_DISPUTE' WHERE EXISTS
   (SELECT 1 FROM beauty.bookings b JOIN beauty.booking_disputes d ON d.booking_id=b.id
    WHERE b.customer_id=target_customer)
  ON CONFLICT(referral_id,reason_code) DO NOTHING;
  INSERT INTO beauty.growth_referral_review_cases(referral_id,reason_code)
  SELECT ref_id,'UNUSUAL_CLAIM_VELOCITY' WHERE EXISTS (
   SELECT 1 FROM beauty.customer_referrals r WHERE r.id=ref_id AND (
    SELECT count(*) FROM beauty.customer_referrals n WHERE n.referrer_user_id=r.referrer_user_id
    AND n.created_at BETWEEN r.created_at-interval '1 hour' AND r.created_at+interval '1 hour'
   )>=10)
  ON CONFLICT(referral_id,reason_code) DO NOTHING;
  -- Cases under review and rejected decisions are never auto-cleared/overwritten.
  IF EXISTS (SELECT 1 FROM beauty.growth_referral_review_cases c
             WHERE c.referral_id=ref_id AND c.status IN ('open','under_review','rejected')) THEN CONTINUE; END IF;
  SELECT CASE WHEN r.referrer_user_id=r.referred_user_id THEN 'rejected'
    WHEN EXISTS (SELECT 1 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
         WHERE b.customer_id=target_customer AND b.status='completed' AND b.completed_at IS NOT NULL
         AND p.captured_pence>0 AND p.refunded_pence=0
         AND NOT EXISTS(SELECT 1 FROM beauty.booking_disputes d WHERE d.booking_id=b.id))
    THEN 'qualified' ELSE 'pending' END INTO next_status
  FROM beauty.customer_referrals r WHERE r.id=ref_id;
  SELECT a.new_status INTO old_status FROM beauty.growth_referral_audit a
  WHERE a.referral_kind='customer' AND a.referral_id=ref_id
  ORDER BY a.occurred_at DESC,a.id DESC LIMIT 1;
  IF old_status IS DISTINCT FROM next_status THEN
   reason:=CASE WHEN next_status='qualified' THEN 'COMPLETED_PAID_BOOKING'
          WHEN old_status='qualified' THEN 'ELIGIBILITY_REVERSED' ELSE 'AWAITING_PAID_BOOKING' END;
   INSERT INTO beauty.growth_referral_audit(referral_kind,referral_id,old_status,new_status,reason_code,idempotency_key)
   VALUES('customer',ref_id,old_status,next_status,reason,
          'auto:'||ref_id::text||':'||gen_random_uuid()::text);
  END IF;
 END LOOP;
 -- Alert owners of newly opened flags; stable unique event_key prevents repeat notices.
 INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href,event_key)
 SELECT ur.user_id,'promotion','Referral requires review',
        'A referral risk signal needs manual assessment.','/admin/growth/review',
        'referral-risk:'||c.id::text
 FROM beauty.growth_referral_review_cases c
 JOIN beauty.customer_referrals r ON r.id=c.referral_id
 JOIN beauty.user_roles ur ON ur.role='owner'
 WHERE r.referred_user_id=target_customer AND c.status='open'
 AND NOT EXISTS(SELECT 1 FROM beauty.in_app_notifications n WHERE n.user_id=ur.user_id
  AND n.event_key='referral-risk:'||c.id::text)
 ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION beauty.growth_reconcile_customer(uuid) FROM PUBLIC,anon,authenticated,beauty_app;

CREATE OR REPLACE FUNCTION beauty.growth_reconcile_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE customer uuid;
BEGIN
 IF TG_TABLE_NAME='customer_referrals' THEN customer:=NEW.referred_user_id;
 ELSIF TG_TABLE_NAME='bookings' THEN customer:=NEW.customer_id;
 ELSIF TG_TABLE_NAME='payments' OR TG_TABLE_NAME='booking_disputes' THEN
 SELECT b.customer_id INTO customer FROM beauty.bookings b WHERE b.id=NEW.booking_id;
 END IF;
 BEGIN
  PERFORM beauty.growth_reconcile_customer(customer);
 EXCEPTION WHEN OTHERS THEN
  -- Analytics must NEVER abort Stripe or booking transaction paths.
  RAISE WARNING 'Growth event reconciliation failed (%): %',SQLSTATE,SQLERRM;
 END;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.growth_reconcile_event() FROM PUBLIC,anon,authenticated,beauty_app;
DROP TRIGGER IF EXISTS growth_referral_insert ON beauty.customer_referrals;
CREATE TRIGGER growth_referral_insert AFTER INSERT ON beauty.customer_referrals
FOR EACH ROW EXECUTE FUNCTION beauty.growth_reconcile_event();
DROP TRIGGER IF EXISTS growth_booking_changed ON beauty.bookings;
CREATE TRIGGER growth_booking_changed AFTER INSERT OR UPDATE OF status,completed_at ON beauty.bookings
FOR EACH ROW EXECUTE FUNCTION beauty.growth_reconcile_event();
DROP TRIGGER IF EXISTS growth_payment_changed ON beauty.payments;
CREATE TRIGGER growth_payment_changed AFTER INSERT OR UPDATE OF captured_pence,refunded_pence,status ON beauty.payments
FOR EACH ROW EXECUTE FUNCTION beauty.growth_reconcile_event();
DROP TRIGGER IF EXISTS growth_dispute_changed ON beauty.booking_disputes;
CREATE TRIGGER growth_dispute_changed AFTER INSERT OR UPDATE OF status ON beauty.booking_disputes
FOR EACH ROW EXECUTE FUNCTION beauty.growth_reconcile_event();

-- Periodic catch-up target for authorised database scheduler, with no public execute grant.
CREATE OR REPLACE FUNCTION beauty.growth_reconcile_all()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; processed integer:=0;
BEGIN
 FOR target IN
 SELECT DISTINCT customer_id FROM (
  SELECT b.customer_id FROM beauty.bookings b WHERE b.created_at>now()-interval '45 days'
  UNION SELECT r.referred_user_id FROM beauty.customer_referrals r WHERE r.created_at>now()-interval '45 days'
  UNION SELECT v.customer_id FROM beauty.growth_profile_attribution v WHERE v.viewed_at>now()-interval '45 days'
 ) candidates
 LOOP
  BEGIN
   PERFORM beauty.growth_reconcile_customer(target);
   processed:=processed+1;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Growth catchup skipped a customer (%): %',SQLSTATE,SQLERRM;
  END;
 END LOOP;
 RETURN processed;
END $$;
REVOKE ALL ON FUNCTION beauty.growth_reconcile_all() FROM PUBLIC,anon,authenticated,beauty_app;

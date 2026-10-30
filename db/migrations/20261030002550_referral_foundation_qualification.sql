-- Rewards remain OFF. Shared booking evidence, not authority to grant credit.
CREATE TABLE beauty.referral_qualification_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 hold_days integer NOT NULL DEFAULT 14 CHECK(hold_days BETWEEN 0 AND 365)
);
INSERT INTO beauty.referral_qualification_policy DEFAULT VALUES;
ALTER TABLE beauty.referral_qualification_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.referral_qualification_policy FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.referral_qualification_policy FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.referral_booking_is_valid(target_booking uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM beauty.bookings b
 JOIN beauty.payments p ON p.booking_id=b.id
 JOIN beauty.professional_profiles pro ON pro.id=b.professional_id
 WHERE b.id=target_booking AND b.status='completed' AND b.completed_at IS NOT NULL

 AND pro.user_id<>b.customer_id AND p.captured_pence>0 AND p.refunded_pence=0
 AND p.status='paid' AND p.stripe_payment_intent_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM beauty.booking_disputes d WHERE d.booking_id=b.id))
$$;
REVOKE ALL ON FUNCTION beauty.referral_booking_is_valid(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.referral_booking_is_mature(target_booking uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT beauty.referral_booking_is_valid(target_booking) AND EXISTS(
 SELECT 1 FROM beauty.bookings b WHERE b.id=target_booking
 AND b.completed_at <= now() - (SELECT hold_days FROM beauty.referral_qualification_policy)*interval '1 day')
$$;
REVOKE ALL ON FUNCTION beauty.referral_booking_is_mature(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE OR REPLACE FUNCTION beauty.growth_reconcile_customer(target_customer uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ref_id uuid; next_status text; old_status text; reason text; added integer;
BEGIN
 IF target_customer IS NULL THEN RETURN; END IF;
 -- Remove links whenever completion, payment or dispute eligibility no longer holds.
 DELETE FROM beauty.growth_booking_attribution a USING beauty.bookings b
 WHERE a.booking_id=b.id AND b.customer_id=target_customer
 AND NOT beauty.referral_booking_is_valid(b.id);
 -- Only attribute verified paid completed, non-disputed bookings to a prior explicit consent.
 INSERT INTO beauty.growth_booking_attribution(booking_id,view_id)
 SELECT DISTINCT ON (b.id) b.id,v.id
 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
 JOIN beauty.growth_profile_attribution v ON v.customer_id=b.customer_id AND v.professional_id=b.professional_id
 WHERE b.customer_id=target_customer AND beauty.referral_booking_is_valid(b.id)
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
  SELECT CASE WHEN r.referrer_user_id=r.referred_user_id THEN 'rejected'
    WHEN EXISTS(SELECT 1 FROM beauty.growth_referral_review_cases c WHERE c.referral_id=ref_id AND c.status='rejected') THEN 'rejected'
    WHEN EXISTS(SELECT 1 FROM beauty.growth_referral_review_cases c WHERE c.referral_id=ref_id AND c.status IN ('open','under_review')) THEN 'flagged'
    WHEN EXISTS (SELECT 1 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
         WHERE b.customer_id=target_customer AND beauty.referral_booking_is_mature(b.id))
    THEN 'qualified' ELSE 'pending' END INTO next_status
  FROM beauty.customer_referrals r WHERE r.id=ref_id;
  SELECT a.new_status INTO old_status FROM beauty.growth_referral_audit a
  WHERE a.referral_kind='customer' AND a.referral_id=ref_id
  ORDER BY a.occurred_at DESC,a.id DESC LIMIT 1;
  IF old_status IS DISTINCT FROM next_status THEN
   reason:=CASE WHEN next_status='qualified' THEN 'COMPLETED_PAID_BOOKING'
          WHEN next_status='flagged' THEN 'OWNER_REVIEW_REQUIRED'
          WHEN next_status='rejected' THEN 'REFERRAL_REJECTED'
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


-- The Owner button uses exactly the event-driven evaluator, including manual reviews.
CREATE OR REPLACE FUNCTION beauty.owner_refresh_referral_audit()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; before_count bigint; after_count bigint;
BEGIN
 PERFORM beauty.require_owner();
 SELECT count(*) INTO before_count FROM beauty.growth_referral_audit;
 FOR target IN SELECT referred_user_id FROM beauty.customer_referrals LOOP
  PERFORM beauty.growth_reconcile_customer(target);
 END LOOP;
 SELECT count(*) INTO after_count FROM beauty.growth_referral_audit;
 RETURN (after_count-before_count)::integer;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_refresh_referral_audit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_refresh_referral_audit() TO beauty_app;

-- Permanent first attribution shared by the existing claim channels. Historical
-- conflicts retain their original source rows; the earliest claim reserves the person.
CREATE TABLE beauty.referral_first_attribution (
 referred_user_id uuid PRIMARY KEY,
 referrer_user_id uuid NOT NULL,
 referral_id uuid NOT NULL UNIQUE,
 channel text NOT NULL CHECK(channel IN ('customer','professional-to-professional')),
 code text NOT NULL,
 attributed_at timestamptz NOT NULL,
 CHECK(referred_user_id<>referrer_user_id)
);
ALTER TABLE beauty.referral_first_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.referral_first_attribution FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.referral_first_attribution FROM PUBLIC,anon,authenticated,beauty_app;
INSERT INTO beauty.referral_first_attribution
SELECT DISTINCT ON (referred_user_id) referred_user_id,referrer_user_id,id,channel,referral_code,created_at
FROM (
 SELECT r.referred_user_id,r.referrer_user_id,r.id,'customer'::text channel,r.referral_code,r.created_at
 FROM beauty.customer_referrals r
 UNION ALL
 SELECT r.referred_user_id,p.user_id,r.id,'professional-to-professional',r.referral_code,r.created_at
 FROM beauty.professional_referrals r JOIN beauty.professional_profiles p ON p.id=r.referrer_professional_id
) claims WHERE referred_user_id<>referrer_user_id
ORDER BY referred_user_id,created_at,id;

CREATE FUNCTION beauty.referral_attribution_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Referral attribution is permanent' USING ERRCODE='23514'; END $$;
CREATE TRIGGER referral_attribution_immutable BEFORE UPDATE OR DELETE ON beauty.referral_first_attribution
FOR EACH ROW EXECUTE FUNCTION beauty.referral_attribution_immutable();
REVOKE ALL ON FUNCTION beauty.referral_attribution_immutable() FROM PUBLIC,anon,authenticated,beauty_app;

CREATE FUNCTION beauty.reserve_first_referral()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE referrer uuid; channel_name text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id
   OR NEW.referred_user_id IS DISTINCT FROM OLD.referred_user_id
   OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
   OR NEW.created_at IS DISTINCT FROM OLD.created_at
   OR (to_jsonb(NEW)->>'referrer_user_id') IS DISTINCT FROM (to_jsonb(OLD)->>'referrer_user_id')
   OR (to_jsonb(NEW)->>'referrer_professional_id') IS DISTINCT FROM (to_jsonb(OLD)->>'referrer_professional_id')
  THEN RAISE EXCEPTION 'Referral attribution is permanent' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='customer_referrals' THEN
  referrer:=NEW.referrer_user_id; channel_name:='customer';
 ELSE
  SELECT user_id INTO STRICT referrer FROM beauty.professional_profiles WHERE id=NEW.referrer_professional_id;
  channel_name:='professional-to-professional';
 END IF;
 IF referrer=NEW.referred_user_id THEN
  RAISE EXCEPTION 'Self referral is blocked' USING ERRCODE='23514';
 END IF;
 -- Primary key serialises simultaneous claims across tables and channels.
 INSERT INTO beauty.referral_first_attribution(referred_user_id,referrer_user_id,referral_id,channel,code,attributed_at)
 VALUES(NEW.referred_user_id,referrer,NEW.id,channel_name,NEW.referral_code,NEW.created_at);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.reserve_first_referral() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER reserve_first_referral BEFORE INSERT OR UPDATE ON beauty.customer_referrals
FOR EACH ROW EXECUTE FUNCTION beauty.reserve_first_referral();
CREATE TRIGGER reserve_first_referral BEFORE INSERT OR UPDATE ON beauty.professional_referrals
FOR EACH ROW EXECUTE FUNCTION beauty.reserve_first_referral();

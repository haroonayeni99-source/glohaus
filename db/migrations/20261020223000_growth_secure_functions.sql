-- Server-verified, explicit opt-in tracking; never import historic aggregate opens.
CREATE OR REPLACE FUNCTION beauty.record_consented_profile_view(target uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid;
BEGIN
 SELECT u.id INTO who FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id
 WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND r.role='customer' LIMIT 1;
 IF who IS NULL OR NOT EXISTS(SELECT 1 FROM beauty.professional_profiles p
 WHERE p.id=target AND p.user_id<>who AND p.publication_status='published')
 THEN RETURN false; END IF;
 -- One view per customer/professional per day; avoid accidental inflated conversions.
 IF EXISTS(SELECT 1 FROM beauty.growth_profile_attribution v WHERE v.customer_id=who
 AND v.professional_id=target AND v.viewed_at>now()-interval '1 day') THEN RETURN true; END IF;
 INSERT INTO beauty.growth_profile_attribution(customer_id,professional_id,consented_at)
 VALUES(who,target,now());
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION beauty.record_consented_profile_view(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.record_consented_profile_view(uuid) TO beauty_app;

-- Assign a view to each booking at most once, only with authenticated consent.
-- Only qualifying paid, completed bookings are exposed as conversions.
CREATE OR REPLACE FUNCTION beauty.owner_refresh_booking_attribution()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tally integer;
BEGIN
 PERFORM beauty.require_owner();
 WITH eligible AS (
 SELECT DISTINCT ON (b.id) b.id booking_id,v.id view_id
 FROM beauty.bookings b
 JOIN beauty.payments p ON p.booking_id=b.id
 JOIN beauty.growth_profile_attribution v ON v.customer_id=b.customer_id AND v.professional_id=b.professional_id
 WHERE b.status='completed' AND b.completed_at IS NOT NULL
 AND p.captured_pence>p.refunded_pence AND p.captured_pence>0
 AND v.viewed_at<=b.created_at AND v.viewed_at>=b.created_at-interval '7 days'
 AND v.expires_at>=b.created_at
 ORDER BY b.id,v.viewed_at DESC
 ), inserted AS (
 INSERT INTO beauty.growth_booking_attribution(booking_id,view_id)
 SELECT booking_id,view_id FROM eligible ON CONFLICT(booking_id) DO NOTHING RETURNING booking_id
 ) SELECT count(*) INTO tally FROM inserted;
 RETURN tally;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_refresh_booking_attribution() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_refresh_booking_attribution() TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.owner_growth_conversion_summary(days_back integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE views_count integer; conversions_count integer;
BEGIN
 PERFORM beauty.require_owner();
 IF days_back NOT IN (7,31,366) THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
 SELECT count(*) INTO views_count FROM beauty.growth_profile_attribution
 WHERE viewed_at>=now()-(days_back*interval '1 day');
 SELECT count(*) INTO conversions_count FROM beauty.growth_booking_attribution a
 JOIN beauty.bookings b ON b.id=a.booking_id
 JOIN beauty.payments p ON p.booking_id=b.id
 WHERE b.completed_at>=now()-(days_back*interval '1 day')
 AND b.status='completed' AND p.captured_pence>p.refunded_pence AND p.captured_pence>0;
 RETURN jsonb_build_object('consentedViews',views_count,'completedPaidAttributedBookings',conversions_count,
 'rate',CASE WHEN views_count>0 THEN round(100.0*conversions_count/views_count,1) ELSE null END);
END $$;
REVOKE ALL ON FUNCTION beauty.owner_growth_conversion_summary(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_growth_conversion_summary(integer) TO beauty_app;

-- Fraud review is provisional. Account creation alone is never 'qualified'.
CREATE OR REPLACE FUNCTION beauty.owner_refresh_referral_audit()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE total integer;
BEGIN
 PERFORM beauty.require_owner();
 WITH evaluated AS (
 SELECT r.id AS referral_id,
 CASE WHEN r.referrer_user_id=r.referred_user_id THEN 'rejected'
 WHEN EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
 WHERE b.customer_id=r.referred_user_id AND b.status='completed' AND p.captured_pence>p.refunded_pence AND p.captured_pence>0)
 THEN 'qualified' ELSE 'pending' END AS next_status,
 CASE WHEN r.referrer_user_id=r.referred_user_id THEN 'SELF_REFERRAL'
 WHEN EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
 WHERE b.customer_id=r.referred_user_id AND b.status='completed' AND p.captured_pence>p.refunded_pence AND p.captured_pence>0)
 THEN 'COMPLETED_PAID_BOOKING' ELSE 'AWAITING_PAID_BOOKING' END AS reason_code
 FROM beauty.customer_referrals r
 ), next_state AS (
 SELECT e.*,prev.new_status AS previous FROM evaluated e
 LEFT JOIN LATERAL (SELECT a.new_status FROM beauty.growth_referral_audit a
 WHERE a.referral_kind='customer' AND a.referral_id=e.referral_id ORDER BY a.occurred_at DESC,a.id DESC LIMIT 1) prev ON true
 WHERE prev.new_status IS DISTINCT FROM e.next_status
 ), inserted AS (
 INSERT INTO beauty.growth_referral_audit(referral_kind,referral_id,old_status,new_status,reason_code,idempotency_key)
 SELECT 'customer',referral_id,previous,next_status,reason_code,
 'customer:'||referral_id::text||':'||next_status||':'||coalesce(previous,'initial')
 FROM next_state ON CONFLICT(idempotency_key) DO NOTHING RETURNING id
 ) SELECT count(*) INTO total FROM inserted;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_refresh_referral_audit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_refresh_referral_audit() TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.owner_growth_referral_audit_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_owner();
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('status',status,'count',total)),'[]'::jsonb)
 FROM (SELECT latest.new_status AS status,count(*)::integer AS total FROM (
 SELECT DISTINCT ON (referral_id) referral_id,new_status FROM beauty.growth_referral_audit
 WHERE referral_kind='customer' ORDER BY referral_id,occurred_at DESC,id DESC
 ) latest GROUP BY latest.new_status) x);
END $$;
REVOKE ALL ON FUNCTION beauty.owner_growth_referral_audit_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_growth_referral_audit_summary() TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.owner_nominate_appreciation(target uuid,why text,gift text,amount integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE out_id uuid;
BEGIN
 PERFORM beauty.require_owner();
 IF target IS NULL OR length(trim(coalesce(why,''))) NOT BETWEEN 10 AND 1000
 OR amount NOT BETWEEN 0 AND 10000000 OR length(coalesce(gift,''))>500 THEN
 RAISE EXCEPTION 'INVALID_NOMINATION'; END IF;
 INSERT INTO beauty.professional_appreciation(professional_id,reason,gift_description,proposed_value_pence)
 VALUES(target,trim(why),nullif(trim(gift),''),amount) RETURNING id INTO out_id;
 RETURN out_id;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_nominate_appreciation(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_nominate_appreciation(uuid,text,text,integer) TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.owner_list_appreciation()
RETURNS TABLE(id uuid,business_name text,reason text,gift_description text,proposed_value_pence integer,state text,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_owner();
 RETURN QUERY SELECT a.id,p.business_name,a.reason,a.gift_description,a.proposed_value_pence,a.state,a.created_at
 FROM beauty.professional_appreciation a JOIN beauty.professional_profiles p ON p.id=a.professional_id
 ORDER BY a.created_at DESC LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_list_appreciation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_list_appreciation() TO beauty_app;

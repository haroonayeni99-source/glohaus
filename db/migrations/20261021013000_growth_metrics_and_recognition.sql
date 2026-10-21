-- Discretionary recognition states: no money, gift delivery or messages automatically initiated.
CREATE OR REPLACE FUNCTION beauty.owner_transition_appreciation(target uuid, new_state text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous text;
BEGIN
 PERFORM beauty.require_owner();
 IF new_state NOT IN ('approved','cancelled','fulfilled') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 SELECT state INTO previous FROM beauty.professional_appreciation WHERE id=target FOR UPDATE;
 IF previous IS NULL THEN RETURN false; END IF;
 IF NOT ((previous='proposed' AND new_state IN ('approved','cancelled')) OR
 (previous='approved' AND new_state IN ('fulfilled','cancelled'))) THEN RETURN false; END IF;
 UPDATE beauty.professional_appreciation SET state=new_state,updated_at=now(),
 approved_at=CASE WHEN new_state='approved' THEN now() ELSE approved_at END,
 fulfilled_at=CASE WHEN new_state='fulfilled' THEN now() ELSE fulfilled_at END WHERE id=target;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_transition_appreciation(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_transition_appreciation(uuid,text) TO beauty_app;

-- Consent cohort: denominator is distinct consenting customer/professional journeys; numerator is
-- those distinct journeys yielding a completed paid booking inside the same 7-day window.
-- A single journey cannot produce a conversion rate above 100%.
CREATE OR REPLACE FUNCTION beauty.owner_growth_conversion_summary(days_back integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE total integer; converted integer;
BEGIN
 PERFORM beauty.require_owner();
 IF days_back NOT IN (7,31,366) THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
 WITH cohort AS (
 SELECT DISTINCT v.customer_id,v.professional_id
 FROM beauty.growth_profile_attribution v WHERE v.viewed_at >= now()-days_back*interval '1 day'
 ), matched AS (
 SELECT c.customer_id,c.professional_id FROM cohort c
 WHERE EXISTS (
 SELECT 1 FROM beauty.growth_profile_attribution v
 JOIN beauty.growth_booking_attribution a ON a.view_id=v.id
 JOIN beauty.bookings b ON b.id=a.booking_id
 JOIN beauty.payments p ON p.booking_id=b.id
 WHERE v.customer_id=c.customer_id AND v.professional_id=c.professional_id
 AND v.viewed_at>=now()-days_back*interval '1 day'
 AND b.created_at BETWEEN v.viewed_at AND v.viewed_at+interval '7 days'
 AND b.status='completed' AND p.captured_pence>0 AND p.captured_pence>p.refunded_pence
 )
 ) SELECT (SELECT count(*) FROM cohort),(SELECT count(*) FROM matched) INTO total,converted;
 RETURN jsonb_build_object('consentedViews',total,'completedPaidAttributedBookings',converted,
 'rate',CASE WHEN total>0 THEN round(100.0*converted/total,1) ELSE NULL END,
 'measurement','distinct_consented_customer_professional_journeys');
END $$;
REVOKE ALL ON FUNCTION beauty.owner_growth_conversion_summary(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_growth_conversion_summary(integer) TO beauty_app;

-- A later invitation must never erase earlier consented profile evidence. Reporting only.
CREATE OR REPLACE FUNCTION beauty.acquisition_overview(days_back integer,owner_report boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; pro uuid; result jsonb;
BEGIN
 IF days_back NOT IN(7,31,366) THEN RAISE EXCEPTION 'INVALID_PERIOD' USING ERRCODE='22023'; END IF;
 IF owner_report THEN PERFORM beauty.require_owner(); ELSE
  SELECT p.id,u.id INTO pro,who FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE u.auth_id=beauty.auth_id() AND u.status='active';
  IF pro IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 WITH qualified AS (
  SELECT b.*,p.captured_pence-p.refunded_pence AS net_paid,
   CASE WHEN EXISTS(SELECT 1 FROM beauty.financial_ledger_transactions l WHERE l.event_reference='booking-payment:'||b.id::text)
     THEN coalesce(q.professional_platform_fee_pence,0) ELSE 0 END AS commission,
   a.declared_source,a.resolution,a.recorded_at,
   EXISTS(SELECT 1 FROM beauty.bookings prior JOIN beauty.payments pp ON pp.booking_id=prior.id
    WHERE prior.customer_id=b.customer_id AND prior.professional_id=b.professional_id AND prior.status='completed'
    AND prior.completed_at<b.completed_at AND pp.captured_pence>pp.refunded_pence
    AND NOT EXISTS(SELECT 1 FROM beauty.booking_disputes d WHERE d.booking_id=prior.id)) AS returning,
   EXISTS(SELECT 1 FROM beauty.growth_profile_attribution v WHERE v.customer_id=b.customer_id AND v.professional_id=b.professional_id
     AND v.viewed_at<=coalesce(initial.created_at,b.created_at) AND coalesce(initial.created_at,b.created_at)<v.expires_at) AS prior_view,
   EXISTS(SELECT 1 FROM beauty.acquisition_invitation_evidence i WHERE i.customer_id=b.customer_id AND i.professional_id=b.professional_id AND i.recorded_at<=coalesce(initial.created_at,b.created_at))
   OR EXISTS(SELECT 1 FROM beauty.professional_referrals r WHERE r.referred_user_id=b.customer_id AND r.referrer_professional_id=b.professional_id AND r.created_at<=coalesce(initial.created_at,b.created_at)) AS invited,
   EXISTS(SELECT 1 FROM beauty.growth_profile_attribution v WHERE v.customer_id=b.customer_id AND v.professional_id=b.professional_id
     AND v.viewed_at<=coalesce(initial.created_at,b.created_at) AND coalesce(initial.created_at,b.created_at)<v.expires_at
     AND NOT EXISTS(SELECT 1 FROM beauty.acquisition_invitation_evidence i WHERE i.customer_id=b.customer_id AND i.professional_id=b.professional_id AND i.recorded_at<=v.viewed_at)
     AND NOT EXISTS(SELECT 1 FROM beauty.professional_referrals r WHERE r.referred_user_id=b.customer_id AND r.referrer_professional_id=b.professional_id AND r.created_at<=v.viewed_at)) AS view_precedes_invitation
  FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
  LEFT JOIN beauty.financial_quotes q ON q.booking_id=b.id
  LEFT JOIN beauty.customer_acquisition a ON a.customer_id=b.customer_id AND a.professional_id=b.professional_id
  LEFT JOIN beauty.bookings initial ON initial.id=a.booking_id
  WHERE b.status='completed' AND b.completed_at BETWEEN now()-days_back*interval '1 day' AND now()
   AND p.captured_pence>p.refunded_pence AND NOT EXISTS(SELECT 1 FROM beauty.booking_disputes d WHERE d.booking_id=b.id)
   AND (owner_report OR b.professional_id=pro)
 ), classified AS (
  SELECT *,CASE WHEN coalesce(resolution,declared_source)='disputed' THEN 'disputed'
   WHEN resolution IS NOT NULL THEN resolution
   WHEN declared_source='glohaus' AND invited THEN 'disputed'
   WHEN declared_source IN('existing_professional','new_professional') AND prior_view AND (NOT invited OR view_precedes_invitation) THEN 'disputed'
   ELSE coalesce(declared_source,'unknown') END AS origin FROM qualified
 ), grouped AS (
  SELECT c.professional_id,p.business_name,c.origin,
   count(*)::int AS bookings,count(DISTINCT c.customer_id)::int AS customers,
   count(*) FILTER(WHERE c.returning)::int AS returning_bookings,
   count(DISTINCT c.customer_id) FILTER(WHERE c.returning)::int AS returning_customers,
   count(*) FILTER(WHERE NOT c.returning)::int AS first_bookings,
   count(*) FILTER(WHERE c.resolution IS NOT NULL OR (c.origin='glohaus' AND c.prior_view AND NOT c.invited) OR (c.origin IN('existing_professional','new_professional') AND c.invited))::int AS supported_bookings,
   sum(c.price_pence)::bigint AS service_value_pence,sum(c.net_paid)::bigint AS net_captured_pence,sum(c.commission)::bigint AS commission_pence
  FROM classified c JOIN beauty.professional_profiles p ON p.id=c.professional_id GROUP BY c.professional_id,p.business_name,c.origin
 ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(g ORDER BY g.business_name,g.origin) FROM grouped g),'[]'::jsonb),
 'uniqueCustomers',(SELECT count(DISTINCT customer_id)::int FROM classified),
 'cases',CASE WHEN owner_report THEN coalesce((SELECT jsonb_agg(x) FROM (
 SELECT a.customer_id,a.professional_id,p.business_name,a.declared_source,a.resolution,a.recorded_at,
 EXISTS(SELECT 1 FROM beauty.acquisition_invitation_evidence e JOIN beauty.bookings first_b ON first_b.id=a.booking_id WHERE e.customer_id=a.customer_id AND e.professional_id=a.professional_id AND e.recorded_at<=first_b.created_at) AS invitation_before_booking,
 EXISTS(SELECT 1 FROM beauty.growth_profile_attribution v JOIN beauty.bookings first_b ON first_b.id=a.booking_id WHERE v.customer_id=a.customer_id AND v.professional_id=a.professional_id AND v.viewed_at<=first_b.created_at AND first_b.created_at<v.expires_at) AS consented_view_before_booking,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('source',h.source,'reason',h.reason,'createdAt',h.created_at) ORDER BY h.created_at),'[]'::jsonb) FROM beauty.acquisition_history h WHERE h.customer_id=a.customer_id AND h.professional_id=a.professional_id) AS history
 FROM beauty.customer_acquisition a JOIN beauty.professional_profiles p ON p.id=a.professional_id WHERE a.resolution IS NULL ORDER BY (a.declared_source='disputed') DESC,a.recorded_at DESC LIMIT 100
 ) x),'[]'::jsonb) ELSE '[]'::jsonb END) INTO result;
 RETURN result;
END $$;

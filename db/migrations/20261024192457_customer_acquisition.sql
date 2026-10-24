-- Reporting-only provenance. Never used by payment, commission or wallet routines.
CREATE TABLE beauty.customer_acquisition (
 customer_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
 booking_id uuid NOT NULL REFERENCES beauty.bookings(id) ON DELETE CASCADE,
 declared_source text NOT NULL CHECK(declared_source IN('existing_professional','new_professional','glohaus','unknown','disputed')),
 resolution text CHECK(resolution IN('existing_professional','new_professional','glohaus','unknown')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(customer_id,professional_id)
);
CREATE TABLE beauty.acquisition_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES beauty.users(id),
 source text NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acquisition_history_pair ON beauty.acquisition_history(customer_id,professional_id,created_at);
CREATE TABLE beauty.acquisition_invitations (
 professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
 token text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text,'-',''),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.acquisition_invitation_evidence (
 customer_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
 medium text NOT NULL CHECK(medium IN('link','qr')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(customer_id,professional_id)
);
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT unnest(ARRAY['customer_acquisition','acquisition_history','acquisition_invitations','acquisition_invitation_evidence']) LOOP
  EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON beauty.%I TO beauty_admin_ops',t);
  EXECUTE format('CREATE POLICY acquisition_ops ON beauty.%I TO beauty_admin_ops USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
GRANT SELECT ON beauty.growth_profile_attribution,beauty.professional_referrals TO beauty_admin_ops;
CREATE POLICY acquisition_referral_read ON beauty.professional_referrals FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY acquisition_view_read ON beauty.growth_profile_attribution FOR SELECT TO beauty_admin_ops USING(true);

CREATE FUNCTION beauty.my_acquisition_invitation() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro beauty.professional_profiles; result jsonb;
BEGIN
 SELECT p.* INTO pro FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id
 WHERE u.auth_id=beauty.auth_id() AND u.status='active';
 IF pro.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 INSERT INTO beauty.acquisition_invitations(professional_id) VALUES(pro.id) ON CONFLICT DO NOTHING;
 SELECT jsonb_build_object('token',i.token,'slug',pro.slug) INTO result FROM beauty.acquisition_invitations i WHERE professional_id=pro.id;
 RETURN result;
END $$;
CREATE FUNCTION beauty.public_acquisition_invitation(invite_token text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('slug',p.slug,'name',p.business_name) FROM beauty.acquisition_invitations i
 JOIN beauty.professional_profiles p ON p.id=i.professional_id JOIN beauty.users u ON u.id=p.user_id
 WHERE i.token=invite_token AND p.publication_status='published' AND u.status='active'
$$;
CREATE FUNCTION beauty.accept_acquisition_invitation(invite_token text,via text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; pro beauty.professional_profiles;
BEGIN
 SELECT id INTO who FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';
 SELECT p.* INTO pro FROM beauty.acquisition_invitations i JOIN beauty.professional_profiles p ON p.id=i.professional_id
 JOIN beauty.users u ON u.id=p.user_id WHERE i.token=invite_token AND p.publication_status='published' AND u.status='active';
 IF who IS NULL OR pro.id IS NULL OR pro.user_id=who OR via NOT IN('link','qr') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 INSERT INTO beauty.acquisition_invitation_evidence(customer_id,professional_id,medium) VALUES(who,pro.id,via) ON CONFLICT DO NOTHING;
 RETURN pro.slug;
END $$;
CREATE FUNCTION beauty.confirm_customer_acquisition(target_booking uuid,source text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; b beauty.bookings; old_source text;
BEGIN
 SELECT id INTO who FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';
 SELECT * INTO b FROM beauty.bookings WHERE id=target_booking AND customer_id=who;
 IF who IS NULL OR b.id IS NULL OR EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=b.professional_id AND user_id=who) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF source IS NULL OR source NOT IN('existing_professional','new_professional','glohaus','unknown','disputed') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||b.professional_id::text,71));
 SELECT declared_source INTO old_source FROM beauty.customer_acquisition WHERE customer_id=who AND professional_id=b.professional_id FOR UPDATE;
 IF old_source=source THEN RETURN; END IF;
 -- A changed claim opens a dispute; it cannot silently rewrite the original claim or an Owner decision.
 IF old_source IS NOT NULL THEN source:='disputed'; END IF;
 IF old_source='disputed' THEN RETURN; END IF;
 INSERT INTO beauty.customer_acquisition(customer_id,professional_id,booking_id,declared_source)
 VALUES(who,b.professional_id,b.id,source) ON CONFLICT(customer_id,professional_id) DO UPDATE SET declared_source='disputed',resolution=NULL;
 INSERT INTO beauty.acquisition_history(customer_id,professional_id,actor_id,source,reason)
 VALUES(who,b.professional_id,who,source,CASE WHEN old_source IS NULL THEN 'Customer booking-source confirmation' ELSE 'Customer challenged the previous source; review required' END);
END $$;
CREATE FUNCTION beauty.my_booking_acquisition(target_booking uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; result jsonb;
BEGIN
 SELECT id INTO who FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';
 SELECT jsonb_build_object('source',a.declared_source,'resolution',a.resolution) INTO result FROM beauty.bookings b
 LEFT JOIN beauty.customer_acquisition a ON a.customer_id=b.customer_id AND a.professional_id=b.professional_id
 WHERE b.id=target_booking AND b.customer_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION beauty.dispute_customer_acquisition(target_booking uuid,explanation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; b beauty.bookings;
BEGIN
 SELECT u.id INTO who FROM beauty.users u WHERE u.auth_id=beauty.auth_id() AND u.status='active';
 SELECT b1.* INTO b FROM beauty.bookings b1 JOIN beauty.professional_profiles p ON p.id=b1.professional_id WHERE b1.id=target_booking AND p.user_id=who;
 IF who IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF length(coalesce(trim(explanation),'')) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(b.customer_id::text||b.professional_id::text,71));
 IF (SELECT count(*) FROM beauty.acquisition_history WHERE actor_id=who AND customer_id=b.customer_id AND professional_id=b.professional_id AND created_at>now()-interval '1 day')>=5 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.customer_acquisition(customer_id,professional_id,booking_id,declared_source) VALUES(b.customer_id,b.professional_id,b.id,'disputed')
 ON CONFLICT(customer_id,professional_id) DO UPDATE SET declared_source='disputed',resolution=NULL;
 INSERT INTO beauty.acquisition_history(customer_id,professional_id,actor_id,source,reason) VALUES(b.customer_id,b.professional_id,who,'disputed',trim(explanation));
END $$;
CREATE FUNCTION beauty.owner_resolve_acquisition(target_customer uuid,target_professional uuid,source text,explanation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=beauty.require_owner();
 IF source IS NULL OR source NOT IN('existing_professional','new_professional','glohaus','unknown') OR length(coalesce(trim(explanation),'')) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.customer_acquisition SET resolution=source WHERE customer_id=target_customer AND professional_id=target_professional;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.acquisition_history(customer_id,professional_id,actor_id,source,reason) VALUES(target_customer,target_professional,actor,source,trim(explanation));
END $$;
CREATE FUNCTION beauty.acquisition_overview(days_back integer,owner_report boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
   OR EXISTS(SELECT 1 FROM beauty.professional_referrals r WHERE r.referred_user_id=b.customer_id AND r.referrer_professional_id=b.professional_id AND r.created_at<=coalesce(initial.created_at,b.created_at)) AS invited
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
   WHEN declared_source IN('existing_professional','new_professional') AND prior_view AND NOT invited THEN 'disputed'
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
-- Existing constrained admin role, never a login or browser role.
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='beauty' AND p.proname IN('my_acquisition_invitation','public_acquisition_invitation','accept_acquisition_invitation','confirm_customer_acquisition','my_booking_acquisition','dispute_customer_acquisition','owner_resolve_acquisition','acquisition_overview') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO beauty_admin_ops',f.sig);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO beauty_app',f.sig);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;

-- Verified-review responses and read-only fee disclosure. No provider calls or financial writes.
CREATE TABLE beauty.review_responses (
 review_id uuid PRIMARY KEY REFERENCES beauty.reviews(id),
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 10 AND 1000),
 moderation_status text NOT NULL DEFAULT 'visible' CHECK(moderation_status IN('visible','hidden')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.review_response_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES beauty.reviews(id),
 actor_id uuid NOT NULL REFERENCES beauty.users(id),body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_response_history_review ON beauty.review_response_history(review_id,created_at);
ALTER TABLE beauty.review_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.review_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.review_response_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.review_response_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.review_responses,beauty.review_response_history FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT,UPDATE ON beauty.review_responses TO beauty_admin_ops;
GRANT SELECT,INSERT ON beauty.review_response_history TO beauty_admin_ops;
CREATE POLICY review_response_ops ON beauty.review_responses TO beauty_admin_ops USING(true) WITH CHECK(true);
CREATE POLICY review_response_history_ops ON beauty.review_response_history TO beauty_admin_ops USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.review_responses TO beauty_catalog;
CREATE POLICY review_response_public ON beauty.review_responses FOR SELECT TO beauty_catalog USING(moderation_status='visible');
CREATE VIEW beauty.public_review_responses WITH(security_barrier=true) AS
 SELECT rr.review_id,rr.body FROM beauty.review_responses rr JOIN beauty.reviews r ON r.id=rr.review_id;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_review_responses OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
REVOKE ALL ON beauty.public_review_responses FROM PUBLIC,anon,authenticated;
GRANT SELECT ON beauty.public_review_responses TO beauty_app;
CREATE FUNCTION beauty.respond_to_review(target uuid,content text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; pro uuid; previous beauty.review_responses;
BEGIN
 SELECT u.id,p.id INTO actor,pro FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id
 JOIN beauty.bookings b ON b.professional_id=p.id JOIN beauty.reviews r ON r.booking_id=b.id
 WHERE r.id=target AND u.auth_id=beauty.auth_id() AND u.status='active' AND b.status='completed';
 IF actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF length(coalesce(trim(content),'')) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,75));
 SELECT * INTO previous FROM beauty.review_responses WHERE review_id=target;
 IF previous.body=trim(content) THEN RETURN; END IF;
 -- Editing a hidden response does not bypass moderation.
 INSERT INTO beauty.review_responses(review_id,professional_id,body) VALUES(target,pro,trim(content))
 ON CONFLICT(review_id) DO UPDATE SET body=EXCLUDED.body,updated_at=now();
 INSERT INTO beauty.review_response_history(review_id,actor_id,body) VALUES(target,actor,trim(content));
END $$;
CREATE FUNCTION beauty.my_review_response(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('body',rr.body,'status',rr.moderation_status) INTO result FROM beauty.review_responses rr JOIN beauty.professional_profiles p ON p.id=rr.professional_id JOIN beauty.users u ON u.id=p.user_id
 WHERE rr.review_id=target AND u.auth_id=beauty.auth_id() AND u.status='active';
 RETURN result;
END $$;
CREATE FUNCTION beauty.admin_moderate_review_response(target uuid,next_status text,decision_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; target_user uuid;
BEGIN
 actor:=beauty.require_admin();
 IF next_status IS NULL OR next_status NOT IN('visible','hidden') OR length(coalesce(trim(decision_reason),'')) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.review_responses SET moderation_status=next_status,updated_at=now() WHERE review_id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 SELECT p.user_id INTO target_user FROM beauty.review_responses rr JOIN beauty.professional_profiles p ON p.id=rr.professional_id WHERE rr.review_id=target;
 INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,reason) VALUES(actor::text,'review_response.'||target::text||'.'||next_status,target_user,trim(decision_reason));
END $$;
CREATE OR REPLACE FUNCTION beauty.admin_booking_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_admin();
 RETURN jsonb_build_object('bookings',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM(SELECT id,service_name,professional_name,customer_name,starts_at,status,price_pence FROM beauty.bookings ORDER BY created_at DESC LIMIT 100)x),
 'reviews',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM(SELECT r.id,r.rating,r.body,r.public_name,r.moderation_status,rr.body AS response_body,rr.moderation_status AS response_status FROM beauty.reviews r LEFT JOIN beauty.review_responses rr ON rr.review_id=r.id ORDER BY r.created_at DESC LIMIT 100)x));
END $$;
CREATE FUNCTION beauty.my_booking_fee_breakdown(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('servicePence',q.service_value_pence,'paidServicePence',q.payable_now_pence,'bookingFeePence',q.customer_platform_fee_pence,'commissionPence',q.professional_platform_fee_pence,'processingPence',q.professional_processing_cost_pence,
 'quotedProceedsPence',q.professional_proceeds_pence,'quotedServiceNetPence',q.service_value_pence-q.professional_platform_fee_pence-q.professional_processing_cost_pence,'refundedPence',pmt.refunded_pence)
 INTO result FROM beauty.bookings b JOIN beauty.professional_profiles p ON p.id=b.professional_id JOIN beauty.users u ON u.id=p.user_id JOIN beauty.financial_quotes q ON q.booking_id=b.id JOIN beauty.payments pmt ON pmt.booking_id=b.id
 WHERE b.id=target AND u.auth_id=beauty.auth_id() AND u.status='active';
 RETURN result;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.respond_to_review(uuid,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.my_review_response(uuid) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_moderate_review_response(uuid,text,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.my_booking_fee_breakdown(uuid) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.respond_to_review(uuid,text),beauty.my_review_response(uuid),beauty.admin_moderate_review_response(uuid,text,text),beauty.my_booking_fee_breakdown(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.respond_to_review(uuid,text),beauty.my_review_response(uuid),beauty.admin_moderate_review_response(uuid,text,text),beauty.my_booking_fee_breakdown(uuid) TO beauty_app;

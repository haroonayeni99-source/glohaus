CREATE TABLE beauty.reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid UNIQUE NOT NULL REFERENCES beauty.bookings(id),
 rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5),body text NOT NULL CHECK(length(body) BETWEEN 20 AND 2000),
 public_name text NOT NULL CHECK(length(public_name) BETWEEN 1 AND 80),moderation_status text NOT NULL DEFAULT 'visible' CHECK(moderation_status IN('visible','hidden')),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beauty.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY review_participant_read ON beauty.reviews FOR SELECT TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.id=booking_id));
CREATE POLICY review_customer_create ON beauty.reviews FOR INSERT TO beauty_app WITH CHECK(moderation_status='visible' AND EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.users u ON u.id=b.customer_id WHERE b.id=booking_id AND b.status='completed' AND b.ends_at<=now() AND u.auth_id=beauty.auth_id() AND u.status='active'));
GRANT SELECT ON beauty.reviews TO beauty_app;
GRANT INSERT(booking_id,rating,body,public_name) ON beauty.reviews TO beauty_app;
GRANT SELECT(id,professional_id,status) ON beauty.bookings TO beauty_catalog;
CREATE POLICY completed_booking_catalog ON beauty.bookings FOR SELECT TO beauty_catalog USING(status='completed' AND EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
GRANT SELECT ON beauty.reviews TO beauty_catalog;
CREATE POLICY reviews_public ON beauty.reviews FOR SELECT TO beauty_catalog USING(moderation_status='visible' AND EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.id=booking_id AND b.status='completed'));
CREATE VIEW beauty.public_reviews WITH(security_barrier=true) AS SELECT r.id,b.professional_id,r.rating,r.body,r.public_name,r.created_at FROM beauty.reviews r JOIN beauty.bookings b ON b.id=r.booking_id;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_reviews OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_reviews TO beauty_app;
GRANT SELECT,UPDATE(moderation_status) ON beauty.reviews TO beauty_admin_ops;
GRANT SELECT ON beauty.bookings TO beauty_admin_ops;
CREATE POLICY admin_booking_read ON beauty.bookings FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY admin_reviews_read ON beauty.reviews FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY admin_reviews_update ON beauty.reviews FOR UPDATE TO beauty_admin_ops USING(true) WITH CHECK(true);
CREATE FUNCTION beauty.admin_moderate_review(target uuid,next_status text,decision_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;target_user uuid;
BEGIN
 actor:=beauty.require_admin();IF next_status NOT IN('visible','hidden') OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
 SELECT b.customer_id INTO target_user FROM beauty.reviews r JOIN beauty.bookings b ON b.id=r.booking_id WHERE r.id=target;
 IF target_user IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';END IF;
 UPDATE beauty.reviews SET moderation_status=next_status WHERE id=target;
 INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,reason) VALUES(actor::text,'review.'||target::text||'.'||next_status,target_user,trim(decision_reason));
END $$;
CREATE FUNCTION beauty.admin_booking_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM beauty.require_admin();RETURN jsonb_build_object('bookings',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM(SELECT id,service_name,professional_name,customer_name,starts_at,status,price_pence FROM beauty.bookings ORDER BY created_at DESC LIMIT 100)x),'reviews',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM(SELECT id,rating,body,public_name,moderation_status FROM beauty.reviews ORDER BY created_at DESC LIMIT 100)x));END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_moderate_review(uuid,text,text) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_booking_overview() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.admin_moderate_review(uuid,text,text),beauty.admin_booking_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_moderate_review(uuid,text,text),beauty.admin_booking_overview() TO beauty_app;

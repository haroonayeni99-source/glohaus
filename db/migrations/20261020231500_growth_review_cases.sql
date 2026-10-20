-- Owner review cases are NOT financial decisions or automatic fraud verdicts.
CREATE TABLE IF NOT EXISTS beauty.growth_referral_review_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 referral_id uuid NOT NULL REFERENCES beauty.customer_referrals(id) ON DELETE CASCADE,
 reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z_]{3,64}$'),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','under_review','cleared','rejected')),
 explanation text NOT NULL DEFAULT '' CHECK(length(explanation)<=1500),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 UNIQUE(referral_id,reason_code)
);
ALTER TABLE beauty.growth_referral_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.growth_referral_review_cases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.growth_referral_review_cases FROM PUBLIC,anon,authenticated,beauty_app;
CREATE INDEX IF NOT EXISTS growth_review_cases_status_idx ON beauty.growth_referral_review_cases(status,created_at DESC);

CREATE OR REPLACE FUNCTION beauty.owner_detect_referral_risks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE added integer;
BEGIN
 PERFORM beauty.require_owner();
 WITH flags AS (
 SELECT r.id AS referral_id, 'SELF_REFERRAL'::text AS reason_code FROM beauty.customer_referrals r
 WHERE r.referrer_user_id=r.referred_user_id
 UNION ALL
 SELECT r.id,'UNUSUAL_CLAIM_VELOCITY' FROM beauty.customer_referrals r
 WHERE (SELECT count(*) FROM beauty.customer_referrals n WHERE n.referrer_user_id=r.referrer_user_id
 AND n.created_at BETWEEN r.created_at-interval '1 hour' AND r.created_at+interval '1 hour')>=10
 UNION ALL
 SELECT r.id,'REFERRAL_BOOKING_DISPUTE' FROM beauty.customer_referrals r
 WHERE EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.booking_disputes d ON d.booking_id=b.id
 WHERE b.customer_id=r.referred_user_id)
 ), inserted AS (
 INSERT INTO beauty.growth_referral_review_cases(referral_id,reason_code)
 SELECT referral_id,reason_code FROM flags ON CONFLICT(referral_id,reason_code) DO NOTHING
 RETURNING id
 ) SELECT count(*)::integer INTO added FROM inserted;
 RETURN added;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_detect_referral_risks() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_detect_referral_risks() TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.owner_list_referral_review_cases()
RETURNS TABLE(id uuid,referral_id uuid,reason_code text,status text,explanation text,created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_owner();
 RETURN QUERY SELECT c.id,c.referral_id,c.reason_code,c.status,c.explanation,c.created_at,c.updated_at
 FROM beauty.growth_referral_review_cases c ORDER BY
 CASE WHEN c.status IN('open','under_review') THEN 0 ELSE 1 END,c.created_at DESC LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_list_referral_review_cases() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_list_referral_review_cases() TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.owner_decide_referral_review(target uuid,decision text,notes text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_status text; referral uuid; who uuid;
BEGIN
 PERFORM beauty.require_owner();
 IF decision NOT IN ('under_review','cleared','rejected') OR length(trim(coalesce(notes,''))) NOT BETWEEN 10 AND 1500
 THEN RAISE EXCEPTION 'INVALID_REVIEW_DECISION'; END IF;
 SELECT c.status,c.referral_id INTO old_status,referral FROM beauty.growth_referral_review_cases c WHERE c.id=target FOR UPDATE;
 IF referral IS NULL OR old_status IN ('cleared','rejected') THEN RETURN false; END IF;
 SELECT u.id INTO who FROM beauty.users u WHERE u.auth_id=beauty.auth_id();
 UPDATE beauty.growth_referral_review_cases SET status=decision, explanation=trim(notes),updated_at=now(),
 resolved_at=CASE WHEN decision IN ('cleared','rejected') THEN now() ELSE NULL END WHERE id=target;
 INSERT INTO beauty.growth_referral_audit(referral_kind,referral_id,old_status,new_status,reason_code,actor_user_id,idempotency_key)
 VALUES('customer',referral,old_status,CASE WHEN decision='rejected' THEN 'rejected' ELSE 'flagged' END,
 CASE WHEN decision='rejected' THEN 'OWNER_REJECTED' WHEN decision='cleared' THEN 'OWNER_CLEARED' ELSE 'OWNER_REVIEWING' END,
 who,'review:'||target::text||':'||decision)
 ON CONFLICT(idempotency_key) DO NOTHING;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_decide_referral_review(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_decide_referral_review(uuid,text,text) TO beauty_app;

-- Database verification will be required before invoking refresh; avoid auto rejecting shared households.

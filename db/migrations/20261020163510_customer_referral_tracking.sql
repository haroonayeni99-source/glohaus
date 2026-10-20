-- Customer referral attribution: immutable first-use claims, no monetary rewards.
CREATE TABLE IF NOT EXISTS beauty.customer_referral_codes (
  user_id uuid PRIMARY KEY REFERENCES beauty.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^GC[A-F0-9]{16}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS beauty.customer_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES beauty.users(id),
  referred_user_id uuid NOT NULL UNIQUE REFERENCES beauty.users(id),
  referral_code text NOT NULL REFERENCES beauty.customer_referral_codes(code),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_referral_no_self CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS customer_referrals_referrer_recent ON beauty.customer_referrals(referrer_user_id,created_at DESC);
ALTER TABLE beauty.customer_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.customer_referral_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.customer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.customer_referrals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.customer_referral_codes,beauty.customer_referrals FROM PUBLIC,anon,authenticated;

-- Explicitly disabled. No trigger, wallet mutation or payout is defined.
INSERT INTO beauty.platform_settings(key,value)
VALUES ('customer_referral_rewards','{"enabled":false,"customerCreditPence":0,"professionalRewardPence":0,"qualification":"completed_paid_booking"}'::jsonb)
ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION beauty.my_customer_referrals()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE actor uuid; code_value text; total_count integer;
BEGIN
  SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id()
    AND status='active' AND deleted_at IS NULL;
  IF actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO beauty.customer_referral_codes(user_id,code)
  VALUES (actor,'GC'||upper(substr(replace(actor::text,'-',''),1,16)))
  ON CONFLICT (user_id) DO NOTHING;
  SELECT code INTO code_value FROM beauty.customer_referral_codes WHERE user_id=actor;
  SELECT count(*)::integer INTO total_count FROM beauty.customer_referrals WHERE referrer_user_id=actor;
  RETURN jsonb_build_object('code',code_value,'totalReferrals',total_count,'rewardsEnabled',false);
END $$;

CREATE OR REPLACE FUNCTION beauty.claim_customer_referral(submitted_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE actor uuid; referrer uuid; created timestamptz;
BEGIN
  IF submitted_code IS NULL OR submitted_code !~ '^GC[A-F0-9]{16}$' THEN RETURN false; END IF;
  SELECT id,created_at INTO actor,created FROM beauty.users
    WHERE auth_id=beauty.auth_id() AND status='active' AND deleted_at IS NULL;
  IF actor IS NULL OR created < now()-interval '1 day' THEN RETURN false; END IF;
  SELECT c.user_id INTO referrer FROM beauty.customer_referral_codes c
    JOIN beauty.users u ON u.id=c.user_id
    WHERE c.code=submitted_code AND u.status='active' AND u.deleted_at IS NULL;
  IF referrer IS NULL OR referrer=actor THEN RETURN false; END IF;
  INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code)
  VALUES(referrer,actor,submitted_code) ON CONFLICT (referred_user_id) DO NOTHING;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION beauty.owner_customer_referrals_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE actor uuid;
BEGIN
  actor:=beauty.require_owner();
  RETURN (
    SELECT jsonb_build_object('total',count(*)::integer,
      'last30Days',count(*) FILTER (WHERE created_at >= now()-interval '30 days')::integer)
    FROM beauty.customer_referrals
  );
END $$;
REVOKE ALL ON FUNCTION beauty.my_customer_referrals() FROM PUBLIC,anon,authenticated,beauty_catalog;
REVOKE ALL ON FUNCTION beauty.claim_customer_referral(text) FROM PUBLIC,anon,authenticated,beauty_catalog;
REVOKE ALL ON FUNCTION beauty.owner_customer_referrals_summary() FROM PUBLIC,anon,authenticated,beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.my_customer_referrals() TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.claim_customer_referral(text) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.owner_customer_referrals_summary() TO beauty_app;

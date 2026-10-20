-- Customer referral attribution: immutable first-use claims, no monetary rewards.
CREATE TABLE IF NOT EXISTS beauty.customer_referral_codes (
  user_id uuid PRIMARY KEY REFERENCES beauty.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^GC[A-F0-9]{16}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS beauty.customer_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES beauty.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL REFERENCES beauty.customer_referral_codes(code) ON DELETE CASCADE,
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
  VALUES (actor,'GC'||upper(encode(extensions.gen_random_bytes(8),'hex')))
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

-- Owners may prepare reward amounts, but cannot enable rewards through this rollout.
CREATE OR REPLACE FUNCTION beauty.owner_customer_reward_draft()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
BEGIN
  PERFORM beauty.require_owner();
  RETURN coalesce((SELECT value FROM beauty.platform_settings WHERE key='customer_referral_rewards'),
    '{"enabled":false,"customerCreditPence":0,"professionalRewardPence":0,"qualification":"completed_paid_booking"}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION beauty.owner_save_customer_reward_draft(customer_credit_pence integer, professional_reward_pence integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE actor uuid; next_value jsonb;
BEGIN
  actor:=beauty.require_owner();
  IF customer_credit_pence IS NULL OR professional_reward_pence IS NULL
    OR customer_credit_pence < 0 OR customer_credit_pence > 5000
    OR professional_reward_pence < 0 OR professional_reward_pence > 5000
  THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  next_value:=jsonb_build_object('enabled',false,'customerCreditPence',customer_credit_pence,
    'professionalRewardPence',professional_reward_pence,'qualification','completed_paid_booking');
  INSERT INTO beauty.platform_settings(key,value,updated_at,updated_by)
  VALUES ('customer_referral_rewards',next_value,now(),actor)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  PERFORM beauty.write_admin_audit(actor,'owner','referrals.reward_draft',actor,'platform_setting',NULL,
    'Owner saved a disabled customer referral reward draft',next_value);
  RETURN next_value;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_customer_reward_draft() FROM PUBLIC,anon,authenticated,beauty_catalog;
REVOKE ALL ON FUNCTION beauty.owner_save_customer_reward_draft(integer,integer) FROM PUBLIC,anon,authenticated,beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.owner_customer_reward_draft() TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.owner_save_customer_reward_draft(integer,integer) TO beauty_app;

-- Isolated staging only. Synthetic records and all worker effects roll back.
BEGIN;
DO $$
DECLARE source_auth uuid:=gen_random_uuid(); referred_auth uuid:=gen_random_uuid();
 source_id uuid; referred_id uuid; source_code text; original_referral uuid;
 target text; operation text; message text;
BEGIN
 IF (SELECT count(*) FROM beauty.referral_rule_versions WHERE enabled OR amount_pence<>0)<>0
 OR NOT (SELECT emergency_stop AND NOT launch_approved AND monthly_budget_pence IS NULL FROM beauty.referral_control_versions ORDER BY id DESC LIMIT 1)
 THEN RAISE EXCEPTION 'EXPECTED_DISABLED_DEFAULTS'; END IF;
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at)
 VALUES(source_auth,source_auth::text||'@example.invalid','{}',now());
 INSERT INTO beauty.users(auth_id,email,display_name)
 VALUES(source_auth::text,source_auth::text||'@example.invalid','Hosted synthetic referrer') RETURNING id INTO source_id;
 INSERT INTO beauty.user_roles(user_id,role) VALUES(source_id,'customer');
 SELECT code INTO source_code FROM beauty.referral_account_codes WHERE user_id=source_id;
 IF source_code !~ '^GR[A-F0-9]{32}$' THEN RAISE EXCEPTION 'INVALID_ACCOUNT_CODE'; END IF;
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at)
 VALUES(referred_auth,referred_auth::text||'@example.invalid',jsonb_build_object('glohaus_referral',jsonb_build_object('code',source_code,'channel','customer')),now());
 INSERT INTO beauty.users(auth_id,email,display_name)
 VALUES(referred_auth::text,referred_auth::text||'@example.invalid','Hosted synthetic referred customer') RETURNING id INTO referred_id;
 SELECT referral_id INTO original_referral FROM beauty.referral_first_attribution
 WHERE referred_user_id=referred_id AND referrer_user_id=source_id AND code=source_code AND channel='customer';
 IF original_referral IS NULL THEN RAISE EXCEPTION 'SIGNUP_ATTRIBUTION_MISSING'; END IF;
 UPDATE auth.users SET raw_user_meta_data='{}' WHERE id=referred_auth;
 IF NOT EXISTS(SELECT 1 FROM beauty.referral_first_attribution WHERE referral_id=original_referral AND code=source_code)
 THEN RAISE EXCEPTION 'ATTRIBUTION_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM beauty.referral_rewards WHERE referral_id=original_referral)
 THEN RAISE EXCEPTION 'SIGNUP_GRANTED_REWARD'; END IF;
 BEGIN
  INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code) VALUES(source_id,source_id,source_code);
  RAISE EXCEPTION 'SELF_REFERRAL_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message NOT ILIKE '%Self referral%' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO beauty.referral_first_attribution(referred_user_id,referrer_user_id,referral_id,channel,code,attributed_at)
  VALUES(referred_id,source_id,gen_random_uuid(),'customer',source_code,now());
  RAISE EXCEPTION 'SECOND_ATTRIBUTION_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 FOREACH operation IN ARRAY ARRAY['UPDATE','DELETE'] LOOP
  BEGIN
   IF operation='UPDATE' THEN UPDATE beauty.referral_rule_versions SET amount_pence=999 WHERE channel='customer';
   ELSE DELETE FROM beauty.referral_rule_versions WHERE channel='customer'; END IF;
   RAISE EXCEPTION 'RULE_MUTATION_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   IF message NOT ILIKE '%permanent%' THEN RAISE; END IF;
  END;
 END LOOP;
 FOREACH target IN ARRAY ARRAY['referral_rewards','referral_reward_events','referral_rule_versions','referral_control_versions'] LOOP
  BEGIN
   EXECUTE format('TRUNCATE beauty.%I CASCADE',target);
   RAISE EXCEPTION 'TRUNCATE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   IF message NOT ILIKE '%permanent%' THEN RAISE; END IF;
  END;
 END LOOP;
END $$;
SET LOCAL ROLE beauty_payment_worker;
SELECT beauty.run_referral_reward_monitor() AS referral_worker,
 beauty.run_founding_expiry_monitor() AS founding_worker;
RESET ROLE;
ROLLBACK;

-- Configuration rollout only. Run after the staged schema and application release
-- have been tested and verified on haroon-glohaus/glohaus1. No historical booking,
-- payment, quote, wallet or payout row is modified. Do not replay over Owner edits.
DO $$
DECLARE actor uuid; owners integer; previous beauty.booking_fee_promotion_settings;
 old_fee integer; previous_rules jsonb; new_rule uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('booking-fee-configuration',0));
 IF EXISTS(SELECT 1 FROM beauty.financial_admin_audit_logs WHERE action='booking_fee.referral_rollout_v1') THEN RETURN; END IF;
 SELECT * INTO previous FROM beauty.booking_fee_promotion_settings WHERE id FOR UPDATE;
 old_fee:=beauty.public_booking_fee_pence();
 IF old_fee<>100 OR previous.enabled OR previous.promotional_fee_pence<>100 THEN
  RAISE EXCEPTION 'BOOKING_FEE_ROLLOUT_STATE_CHANGED';
 END IF;
 SELECT count(*),(array_agg(u.id ORDER BY u.created_at))[1] INTO owners,actor
 FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='owner'
 WHERE u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now());
 IF owners<>1 THEN RAISE EXCEPTION 'BOOKING_FEE_ROLLOUT_OWNER_AMBIGUOUS'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO previous_rules FROM beauty.financial_fee_rules r
 WHERE transaction_kind='booking' AND category_key IS NULL AND fee_payer='customer' AND active;
 UPDATE beauty.financial_fee_rules SET active=false,effective_until=greatest(clock_timestamp(),effective_from+interval '1 microsecond')
 WHERE transaction_kind='booking' AND category_key IS NULL AND fee_payer='customer' AND active;
 INSERT INTO beauty.financial_fee_rules(transaction_kind,category_key,fee_payer,percentage_basis_points,fixed_fee_pence,
 minimum_fee_pence,maximum_fee_pence,minimum_transaction_pence,processing_cost_payer,created_by_user_id)
 VALUES('booking',NULL,'customer',0,150,0,NULL,1,'platform',actor) RETURNING id INTO new_rule;
 UPDATE beauty.booking_fee_promotion_settings SET enabled=true,promotional_fee_pence=100,version=version+1,updated_at=now() WHERE id;
 INSERT INTO beauty.financial_admin_audit_logs(actor_user_id,action,target_type,target_id,reason,previous_state,new_state)
 VALUES(actor,'booking_fee.referral_rollout_v1','booking_fee_settings',new_rule,
 'User-approved GBP 1.50 standard and GBP 1 eligible referred first-booking fees, activated after application deployment verification.',
 jsonb_build_object('standardFeePence',old_fee,'settings',to_jsonb(previous),'rules',previous_rules),
 jsonb_build_object('standardFeePence',150,'promotionalFeePence',100,'promotionEnabled',true));
END $$;

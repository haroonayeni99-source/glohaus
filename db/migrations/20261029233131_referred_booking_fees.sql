-- Stage referral fees without changing the live standard fee or historical quotes.
CREATE TABLE beauty.booking_fee_promotion_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 promotional_fee_pence integer NOT NULL DEFAULT 100 CHECK(promotional_fee_pence BETWEEN 0 AND 2500),
 enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO beauty.booking_fee_promotion_settings(id) VALUES(true);
ALTER TABLE beauty.booking_fee_promotion_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.booking_fee_promotion_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.booking_fee_promotion_settings FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,UPDATE ON beauty.booking_fee_promotion_settings TO beauty_admin_ops;
CREATE POLICY booking_fee_settings_owner_ops ON beauty.booking_fee_promotion_settings TO beauty_admin_ops USING(true) WITH CHECK(true);
GRANT SELECT(id,promotional_fee_pence,enabled,version) ON beauty.booking_fee_promotion_settings TO beauty_catalog;
CREATE POLICY booking_fee_settings_catalog_read ON beauty.booking_fee_promotion_settings FOR SELECT TO beauty_catalog USING(id);
CREATE VIEW beauty.public_booking_fee_promotion WITH(security_barrier=true) AS
 SELECT promotional_fee_pence,enabled,version FROM beauty.booking_fee_promotion_settings WHERE id;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_booking_fee_promotion OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
REVOKE ALL ON beauty.public_booking_fee_promotion FROM PUBLIC;
GRANT SELECT ON beauty.public_booking_fee_promotion,beauty.public_booking_fee
 TO beauty_app,beauty_booking_ops,beauty_financial_worker,beauty_payment_worker,beauty_admin_ops;

CREATE FUNCTION beauty.public_booking_fee_configuration() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('standardFeePence',f.fee_pence,
 'promotionalFeePence',least(p.promotional_fee_pence,f.fee_pence),
 'promotionEnabled',p.enabled,'version',p.version)
 FROM beauty.public_booking_fee f CROSS JOIN beauty.public_booking_fee_promotion p
$$;
REVOKE ALL ON FUNCTION beauty.public_booking_fee_configuration() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.public_booking_fee_configuration()
 TO beauty_app,beauty_booking_ops,beauty_financial_worker,beauty_payment_worker,beauty_admin_ops;

-- Only existing private operators may inspect attribution; no browser table access.
GRANT SELECT ON beauty.customer_referrals,beauty.customer_referral_codes,beauty.growth_referral_review_cases TO beauty_admin_ops;
CREATE POLICY booking_fee_referral_read ON beauty.customer_referrals FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY booking_fee_code_read ON beauty.customer_referral_codes FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY booking_fee_review_read ON beauty.growth_referral_review_cases FOR SELECT TO beauty_admin_ops USING(true);

CREATE INDEX booking_fee_identity_lookup ON beauty.users ((lower(trim(email))));

CREATE FUNCTION beauty.booking_fee_offer_for_customer(target uuid,excluding_booking uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE config jsonb:=beauty.public_booking_fee_configuration(); actor beauty.users; eligible boolean:=false; reason text:='not_referred'; standard_fee integer:=(config->>'standardFeePence')::integer; actual_fee integer;
BEGIN
 actual_fee:=standard_fee;
 SELECT * INTO actor FROM beauty.users WHERE id=target AND status='active' AND deleted_at IS NULL
  AND (restricted_until IS NULL OR restricted_until<=now())
  AND EXISTS(SELECT 1 FROM beauty.user_roles ur WHERE ur.user_id=target AND ur.role='customer');
 IF NOT coalesce((config->>'promotionEnabled')::boolean,false) THEN reason:='promotion_disabled';
 ELSIF actor.id IS NULL THEN reason:='customer_required';
 ELSIF EXISTS(SELECT 1 FROM beauty.customer_referrals r JOIN beauty.growth_referral_review_cases c ON c.referral_id=r.id
   WHERE r.referred_user_id=target AND c.status IN('open','under_review','rejected')) THEN reason:='review_pending';
 ELSIF EXISTS(SELECT 1 FROM beauty.users other WHERE other.id<>target AND lower(trim(other.email))=lower(trim(actor.email))
   AND EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.customer_id=other.id
    AND b.status NOT IN('cancelled','expired'))) THEN reason:='identity_review';
 ELSIF EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.booking_disputes d ON d.booking_id=b.id
   WHERE b.customer_id=target AND d.status IN('warning_needs_response','warning_under_review','needs_response','under_review')) THEN reason:='review_pending';
 ELSIF EXISTS(SELECT 1 FROM beauty.bookings b LEFT JOIN beauty.payments p ON p.booking_id=b.id
   WHERE b.customer_id=target AND b.id IS DISTINCT FROM excluding_booking AND
   ((b.status='payment_pending' AND b.hold_expires_at>now()) OR
    (b.status IN('confirmed','completed') AND p.captured_pence>0 AND p.refunded_pence=0)))
 THEN reason:='already_used_or_reserved';
 ELSIF EXISTS(
   SELECT 1 FROM beauty.customer_referrals r JOIN beauty.customer_referral_codes c
    ON c.user_id=r.referrer_user_id AND c.code=r.referral_code
   JOIN beauty.users referrer ON referrer.id=r.referrer_user_id
   WHERE r.referred_user_id=target AND r.referrer_user_id<>target AND referrer.status='active' AND referrer.deleted_at IS NULL
    AND (referrer.restricted_until IS NULL OR referrer.restricted_until<=now())
    AND r.created_at BETWEEN actor.created_at AND actor.created_at+interval '24 hours' AND r.created_at<=now()
    AND (SELECT count(*) FROM beauty.customer_referrals recent WHERE recent.referrer_user_id=r.referrer_user_id
     AND recent.created_at>=now()-interval '1 hour')<10
  ) OR EXISTS(
   SELECT 1 FROM beauty.acquisition_invitation_evidence e
   JOIN beauty.acquisition_invitations i ON i.professional_id=e.professional_id
   JOIN beauty.professional_profiles pro ON pro.id=e.professional_id
   JOIN beauty.users referrer ON referrer.id=pro.user_id
   WHERE e.customer_id=target AND pro.user_id<>target AND e.recorded_at<=now()
    AND referrer.status='active' AND referrer.deleted_at IS NULL
    AND (referrer.restricted_until IS NULL OR referrer.restricted_until<=now())
  ) THEN eligible:=true; reason:='first_referred_booking'; actual_fee:=(config->>'promotionalFeePence')::integer;
 END IF;
 RETURN jsonb_build_object('standardFeePence',standard_fee,'bookingFeePence',actual_fee,
  'referralDiscountPence',standard_fee-actual_fee,'referralPromotionEligible',eligible,
  'feePromotionReason',reason);
END $$;
CREATE FUNCTION beauty.my_booking_fee_offer() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE customer uuid; BEGIN
 SELECT id INTO customer FROM beauty.users WHERE auth_id=beauty.auth_id();
 RETURN beauty.booking_fee_offer_for_customer(customer);
END $$;

CREATE FUNCTION beauty.owner_set_booking_fees(standard_fee integer,promotional_fee integer,decision_reason text,promotion_enabled boolean DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_owner(); previous beauty.booking_fee_promotion_settings; next_promo integer; previous_rules jsonb; new_rule uuid; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('booking-fee-configuration',0));
 SELECT * INTO previous FROM beauty.booking_fee_promotion_settings WHERE id FOR UPDATE;
 next_promo:=coalesce(promotional_fee,least(previous.promotional_fee_pence,standard_fee));
 IF standard_fee IS NULL OR standard_fee NOT BETWEEN 0 AND 2500 OR next_promo NOT BETWEEN 0 AND standard_fee
  OR length(trim(coalesce(decision_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO previous_rules FROM beauty.financial_fee_rules r
  WHERE transaction_kind='booking' AND category_key IS NULL AND fee_payer='customer' AND active;
 UPDATE beauty.financial_fee_rules SET active=false,effective_until=greatest(clock_timestamp(),effective_from+interval '1 microsecond')
  WHERE transaction_kind='booking' AND category_key IS NULL AND fee_payer='customer' AND active;
 INSERT INTO beauty.financial_fee_rules(transaction_kind,category_key,fee_payer,percentage_basis_points,fixed_fee_pence,
  minimum_fee_pence,maximum_fee_pence,minimum_transaction_pence,processing_cost_payer,created_by_user_id)
 VALUES('booking',NULL,'customer',0,standard_fee,0,NULL,1,'platform',actor) RETURNING id INTO new_rule;
 INSERT INTO beauty.financial_admin_audit_logs(actor_user_id,action,target_type,target_id,reason,previous_state,new_state)
 VALUES(actor,'financial_fee_rule.created','financial_fee_rule',new_rule,trim(decision_reason),previous_rules,
  jsonb_build_object('id',new_rule,'transactionKind','booking','feePayer','customer','fixedFeePence',standard_fee));
 UPDATE beauty.booking_fee_promotion_settings SET promotional_fee_pence=next_promo,
  enabled=coalesce(promotion_enabled,enabled),version=version+1,updated_at=now() WHERE id;
 INSERT INTO beauty.financial_admin_audit_logs(actor_user_id,action,target_type,reason,previous_state,new_state)
 VALUES(actor,'booking_fee.promotion_changed','booking_fee_settings',decision_reason,to_jsonb(previous),
  jsonb_build_object('standardFeePence',standard_fee,'promotionalFeePence',next_promo,'enabled',coalesce(promotion_enabled,previous.enabled)));
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.booking_fee_offer_for_customer(uuid,uuid) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.my_booking_fee_offer() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_set_booking_fees(integer,integer,text,boolean) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.booking_fee_offer_for_customer(uuid,uuid),beauty.my_booking_fee_offer(),beauty.owner_set_booking_fees(integer,integer,text,boolean)
 FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.booking_fee_offer_for_customer(uuid,uuid) TO beauty_booking_ops,beauty_financial_worker;
GRANT EXECUTE ON FUNCTION beauty.my_booking_fee_offer() TO beauty_app,beauty_booking_ops;
GRANT EXECUTE ON FUNCTION beauty.owner_set_booking_fees(integer,integer,text,boolean) TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.public_service_policy(target_service uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE s beauty.services; g jsonb:=beauty.default_booking_policy(); extra jsonb:='{}'; general_id uuid; service_id uuid; rules jsonb; verified boolean; dep integer; published timestamptz; service_published timestamptz; result jsonb; fee_offer jsonb; BEGIN
 SELECT s0.* INTO s FROM beauty.services s0 JOIN beauty.professional_profiles p ON p.id=s0.professional_id JOIN beauty.users u ON u.id=p.user_id WHERE s0.id=target_service AND s0.active AND p.publication_status='published' AND u.status='active';
 IF s.id IS NULL THEN RAISE EXCEPTION 'UNAVAILABLE_SERVICE' USING ERRCODE='22023'; END IF;
 s:=beauty.request_service_quote_row(target_service);
 SELECT v.content,v.id,r.published_at INTO rules,general_id,published FROM beauty.professional_policy_scopes sc JOIN beauty.professional_policy_versions v ON v.id=sc.published_version_id JOIN beauty.professional_policy_reviews r ON r.version_id=v.id AND r.status='approved' WHERE sc.professional_id=s.professional_id AND sc.service_id IS NULL;
 g:=g||coalesce(jsonb_strip_nulls(rules),'{}');
 SELECT v.content,v.id,r.published_at INTO rules,service_id,service_published FROM beauty.professional_policy_scopes sc JOIN beauty.professional_policy_versions v ON v.id=sc.published_version_id JOIN beauty.professional_policy_reviews r ON r.version_id=v.id AND r.status='approved' WHERE sc.service_id=s.id;
 published:=greatest(published,service_published); extra:=coalesce(jsonb_strip_nulls(rules),'{}'); rules:=g||extra;
 -- Requirements and preparation supplement general requirements; a treatment cannot silently remove a general safety requirement.
 rules:=rules||jsonb_build_object('preparation',(SELECT coalesce(jsonb_agg(value ORDER BY first_index),'[]') FROM(SELECT value,min(n) AS first_index FROM jsonb_array_elements_text((g->'preparation')||coalesce(extra->'preparation','[]')) WITH ORDINALITY AS p(value,n) GROUP BY value) merged),
 'lateInstructions',coalesce(nullif(extra->>'lateInstructions',''),g->>'lateInstructions'),
 'preparationText',concat_ws(E'\n',nullif(g->>'preparationText',''),nullif(extra->>'preparationText','')),
 'requireReferences',coalesce((g->>'requireReferences')::boolean,false) OR coalesce((extra->>'requireReferences')::boolean,false),
 'requireConsultation',coalesce((g->>'requireConsultation')::boolean,false) OR coalesce((extra->>'requireConsultation')::boolean,false),
 'requirePatchTest',coalesce((g->>'requirePatchTest')::boolean,false) OR coalesce((extra->>'requirePatchTest')::boolean,false),
 'restrictions',concat_ws(E'\n',nullif(g->>'restrictions',''),nullif(extra->>'restrictions','')));
 verified:=coalesce((beauty.professional_access_state(s.professional_id)->>'verified')::boolean,false);
 dep:=CASE WHEN NOT verified THEN s.price_pence WHEN (rules->>'depositPercent') IS NOT NULL THEN greatest(ceil(s.price_pence*0.15)::int,least(floor(s.price_pence*0.4)::int,round(s.price_pence*(rules->>'depositPercent')::numeric/100)::int)) ELSE s.deposit_pence END;
 
 -- Keep the professional-required deposit separate from the customer's chosen upfront amount.
 rules:=rules||jsonb_build_object('paymentRequirement',coalesce(rules->>'paymentRequirement','deposit_or_full'));
 IF NOT verified OR rules->>'paymentRequirement'='full'
   OR (nullif(current_setting('app.booking_payment_selection',true),'')::jsonb->>'serviceId'=target_service::text
       AND nullif(current_setting('app.booking_payment_selection',true),'')::jsonb->>'choice'='full') THEN
  dep:=s.price_pence;
 END IF;
 IF (NOT verified OR rules->>'paymentRequirement'='full')
   AND nullif(current_setting('app.booking_payment_selection',true),'')::jsonb->>'serviceId'=target_service::text
   AND nullif(current_setting('app.booking_payment_selection',true),'')::jsonb->>'choice'='deposit' THEN
  RAISE EXCEPTION 'FULL_PAYMENT_REQUIRED' USING ERRCODE='22023';
 END IF;
 fee_offer:=beauty.my_booking_fee_offer();
 result:=jsonb_build_object('professionalId',s.professional_id,'serviceId',s.id,'serviceName',s.name,'generalVersionId',general_id,'serviceVersionId',service_id,'rules',rules,'generalCustomRules',g->>'customRules','serviceCustomRules',coalesce(extra->>'customRules',''),'timezone','Europe/London','pricePence',s.price_pence,'depositPence',dep,'bookingFeePence',(fee_offer->>'bookingFeePence')::integer,'fullPrepayment',dep=s.price_pence,
 'paymentChoice',CASE WHEN dep=s.price_pence THEN 'full' ELSE 'deposit' END,
 'paymentRequirement',CASE WHEN NOT verified THEN 'full' ELSE rules->>'paymentRequirement' END,
 'requiredDepositPence',CASE WHEN NOT verified THEN 0 WHEN rules->>'depositPercent' IS NOT NULL THEN greatest(ceil(s.price_pence*0.15)::int,least(floor(s.price_pence*0.4)::int,round(s.price_pence*(rules->>'depositPercent')::numeric/100)::int)) ELSE s.deposit_pence END,
 'fullPaymentReason',CASE WHEN NOT verified THEN 'starter' WHEN rules->>'paymentRequirement'='full' THEN 'professional' WHEN dep=s.price_pence THEN 'customer' ELSE NULL END,'publishedAt',published);
 result:=result||fee_offer;
 result:=result||jsonb_build_object('serviceOptions',beauty.request_service_quote(target_service)||jsonb_build_object('depositPence',dep));
 RETURN result||jsonb_build_object('token',md5(result::text));
END $function$;

CREATE OR REPLACE FUNCTION beauty.reserve_booking(target_service uuid, target_start timestamp with time zone, accepted_token text, early_service boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE snapshot jsonb; result jsonb; b beauty.bookings; terms beauty.booking_policy_terms; pro uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer' WHERE u.auth_id=beauty.auth_id() AND u.status='active') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Serialize first-booking eligibility before reading the accepted quote.
 PERFORM pg_advisory_xact_lock(hashtextextended('booking-fee-identity:'||(SELECT lower(trim(email)) FROM beauty.users WHERE auth_id=beauty.auth_id()),0));
 PERFORM pg_advisory_xact_lock(hashtextextended('booking-fee-customer:'||beauty.auth_id(),0));
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('booking-fee-configuration',0));
 SELECT professional_id INTO pro FROM beauty.services WHERE id=target_service;
 PERFORM pg_advisory_xact_lock(hashtextextended('policies:'||pro::text,0));
 snapshot:=beauty.public_service_policy(target_service);
 IF accepted_token IS NULL OR accepted_token IS DISTINCT FROM snapshot->>'token' THEN RAISE EXCEPTION 'POLICY_CHANGED' USING ERRCODE='22023'; END IF;
 IF early_service IS NULL OR (target_start<beauty.policy_cooling_off_end(now()) AND NOT early_service) THEN RAISE EXCEPTION 'EARLY_SERVICE_REQUEST_REQUIRED' USING ERRCODE='22023'; END IF;
 PERFORM set_config('app.policy_acceptance',snapshot::text,true);
 result:=beauty.reserve_booking_before_policies(target_service,target_start);
 PERFORM set_config('app.policy_acceptance','',true);
 SELECT * INTO b FROM beauty.bookings WHERE id=(result->>'id')::uuid;
 -- Prices and fees may change independently of professional policy publication.
 -- Reject and roll back if the authoritative reservation differs from the terms reviewed.
 IF b.price_pence IS DISTINCT FROM (snapshot->>'pricePence')::integer
  OR b.deposit_pence IS DISTINCT FROM (snapshot->>'depositPence')::integer
  OR (SELECT customer_fee_pence FROM beauty.booking_commission_terms WHERE booking_id=b.id)
     IS DISTINCT FROM (snapshot->>'bookingFeePence')::integer THEN
  RAISE EXCEPTION 'POLICY_CHANGED' USING ERRCODE='22023';
 END IF;
 SELECT * INTO terms FROM beauty.booking_policy_terms WHERE booking_id=b.id;
 IF terms.booking_id IS NOT NULL THEN
  IF terms.snapshot->>'token' IS DISTINCT FROM accepted_token THEN RAISE EXCEPTION 'POLICY_CHANGED' USING ERRCODE='22023'; END IF;
 ELSE
  INSERT INTO beauty.booking_policy_terms(booking_id,professional_id,customer_id,service_id,general_version_id,service_version_id,snapshot,acknowledged_at,acknowledgement_source,early_service_requested,original_starts_at,price_pence,deposit_pence,pricing_version)
  VALUES(b.id,b.professional_id,b.customer_id,b.service_id,(snapshot->>'generalVersionId')::uuid,(snapshot->>'serviceVersionId')::uuid,snapshot,now(),'affirmative',early_service,b.starts_at,b.price_pence,b.deposit_pence,(SELECT pricing_version FROM beauty.booking_commission_terms WHERE booking_id=b.id));
 END IF;
 RETURN result||jsonb_build_object('standardFeePence',(snapshot->>'standardFeePence')::integer,'referralDiscountPence',(snapshot->>'referralDiscountPence')::integer);
END $function$;

CREATE OR REPLACE FUNCTION beauty.snapshot_booking_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE rule jsonb; total integer; BEGIN
 rule:=beauty.resolve_service_commission(NEW.professional_id);
 total:=round(NEW.price_pence::numeric*(rule->>'basisPoints')::integer/10000)::integer;
 -- For new promoted quotes, never release proceeds while commission is under-collected.
 IF total>NEW.deposit_pence THEN RAISE EXCEPTION 'COMMISSION_EXCEEDS_DEPOSIT' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.booking_commission_terms(booking_id,professional_id,rule_id,rule_reference,pricing_version,basis_points,standard_basis_points,commission_pence,waived_pence,customer_fee_pence)
 VALUES(NEW.id,NEW.professional_id,(rule->>'ruleId')::uuid,rule->>'ruleReference',rule->>'pricingVersion',(rule->>'basisPoints')::integer,(rule->>'standardBasisPoints')::integer,total,
 greatest(0,round(NEW.price_pence::numeric*(rule->>'standardBasisPoints')::integer/10000)::integer-total),(beauty.booking_fee_offer_for_customer(NEW.customer_id,NEW.id)->>'bookingFeePence')::integer);
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION beauty.owner_active_booking_fee_rule()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  actor uuid;
  active_rule beauty.financial_fee_rules;
BEGIN
  actor:=beauty.require_owner();

  SELECT * INTO active_rule
  FROM beauty.financial_fee_rules r
  WHERE r.transaction_kind='booking'
    AND r.category_key IS NULL
    AND r.fee_payer='customer'
    AND r.active
    AND r.effective_from<=now()
    AND (r.effective_until IS NULL OR r.effective_until>now())
  ORDER BY r.effective_from DESC,r.id DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'id', active_rule.id,
    'fixedFeePence', coalesce(active_rule.fixed_fee_pence,100),
    'effectiveFrom', active_rule.effective_from,
    'usingDefault', active_rule.id IS NULL,
    'promotionalFeePence', (SELECT promotional_fee_pence FROM beauty.booking_fee_promotion_settings WHERE id),
    'promotionEnabled', (SELECT enabled FROM beauty.booking_fee_promotion_settings WHERE id)
  );
END
$function$;

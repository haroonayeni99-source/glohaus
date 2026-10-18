-- Add a payment choice to future bookings. Existing financial snapshots are untouched.
-- The original reservation, availability, commission and refund functions remain authoritative.
DO $$ DECLARE definition text; old text; BEGIN
 definition:=pg_get_functiondef('beauty.validate_professional_policy(jsonb,boolean)'::regprocedure);
 old:='IF jsonb_typeof(payload)';
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'POLICY_VALIDATOR_CHANGED'; END IF;
 definition:=replace(definition,old,$patch$IF payload ? 'paymentRequirement' AND NOT (
   payload->'paymentRequirement' IN ('"deposit_or_full"'::jsonb,'"full"'::jsonb)
   OR (service_specific AND payload->'paymentRequirement'='null'::jsonb)
 ) THEN RETURN false; END IF;
 IF jsonb_typeof(payload)$patch$);
 definition:=replace(definition,'jsonb_object_keys(payload)','jsonb_object_keys(payload - ''paymentRequirement'')');
 definition:=replace(definition,'jsonb_each(payload)','jsonb_each(payload - ''paymentRequirement'')');
 EXECUTE definition;

 definition:=pg_get_functiondef('beauty.public_service_policy(uuid)'::regprocedure);
 old:='result:=jsonb_build_object(''professionalId''';
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'PAYMENT_POLICY_INTEGRATION_CHANGED'; END IF;
 definition:=replace(definition,old,$patch$
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
 result:=jsonb_build_object('professionalId'$patch$);
 old:='''fullPrepayment'',NOT verified';
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'PAYMENT_POLICY_FULL_FLAG_CHANGED'; END IF;
 definition:=replace(definition,old,$patch$'fullPrepayment',dep=s.price_pence,
 'paymentChoice',CASE WHEN dep=s.price_pence THEN 'full' ELSE 'deposit' END,
 'paymentRequirement',CASE WHEN NOT verified THEN 'full' ELSE rules->>'paymentRequirement' END,
 'requiredDepositPence',CASE WHEN NOT verified THEN 0 WHEN rules->>'depositPercent' IS NOT NULL THEN greatest(ceil(s.price_pence*0.15)::int,least(floor(s.price_pence*0.4)::int,round(s.price_pence*(rules->>'depositPercent')::numeric/100)::int)) ELSE s.deposit_pence END,
 'fullPaymentReason',CASE WHEN NOT verified THEN 'starter' WHEN rules->>'paymentRequirement'='full' THEN 'professional' WHEN dep=s.price_pence THEN 'customer' ELSE NULL END$patch$);
 EXECUTE definition;
END $$;

-- Request-scoped selection is restored on success and failure, as for service options.
CREATE FUNCTION beauty.service_payment_policy(target_service uuid,variation uuid,extras uuid[],payment_choice text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous text:=coalesce(current_setting('app.booking_payment_selection',true),''); result jsonb;
BEGIN
 IF payment_choice IS NULL OR payment_choice NOT IN('auto','deposit','full') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM set_config('app.booking_payment_selection',jsonb_build_object('serviceId',target_service,'choice',payment_choice)::text,true);
 result:=beauty.public_service_policy(target_service,variation,extras);
 PERFORM set_config('app.booking_payment_selection',previous,true);
 RETURN result;
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.booking_payment_selection',previous,true); RAISE;
END $$;
CREATE FUNCTION beauty.reserve_booking_with_payment(target_service uuid,target_start timestamptz,accepted_token text,early_service boolean,variation uuid,extras uuid[],payment_choice text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous text:=coalesce(current_setting('app.booking_payment_selection',true),''); result jsonb;
BEGIN
 IF payment_choice IS NULL OR payment_choice NOT IN('auto','deposit','full') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM set_config('app.booking_payment_selection',jsonb_build_object('serviceId',target_service,'choice',payment_choice)::text,true);
 -- This existing function checks customer identity, policy token, availability and all limits.
 result:=beauty.reserve_booking(target_service,target_start,accepted_token,early_service,variation,extras);
 PERFORM set_config('app.booking_payment_selection',previous,true);
 RETURN result;
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.booking_payment_selection',previous,true); RAISE;
END $$;

-- A full service payment is valid only with an acknowledged authoritative full-payment snapshot.
-- Partial professional-required deposits retain their original 15%-40% bounds.
CREATE OR REPLACE FUNCTION beauty.enforce_required_deposit_cap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE is_verified boolean:=false; snapshot jsonb;
BEGIN
 IF NEW.price_pence IS NULL OR NEW.price_pence<=0 THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.price_pence=OLD.price_pence AND NEW.deposit_pence=OLD.deposit_pence THEN RETURN NEW; END IF;
 SELECT coalesce((beauty.professional_access_state(NEW.professional_id)->>'verified')::boolean,false) INTO is_verified;
 IF is_verified AND NEW.deposit_pence=NEW.price_pence AND TG_OP='INSERT' THEN
  snapshot:=nullif(current_setting('app.policy_acceptance',true),'')::jsonb;
  IF snapshot->>'serviceId'=NEW.service_id::text AND snapshot->>'paymentChoice'='full'
    AND (snapshot->>'pricePence')::integer=NEW.price_pence AND (snapshot->>'depositPence')::integer=NEW.deposit_pence
    AND coalesce((snapshot->>'fullPrepayment')::boolean,false) THEN RETURN NEW; END IF;
 END IF;
 IF is_verified AND NEW.deposit_pence*100>NEW.price_pence*40 THEN RAISE EXCEPTION 'MAXIMUM_DEPOSIT_EXCEEDED' USING ERRCODE='22023'; END IF;
 IF is_verified AND NEW.deposit_pence*100<NEW.price_pence*15 THEN RAISE EXCEPTION 'MINIMUM_DEPOSIT_REQUIRED' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;

-- Match existing restricted function ownership, with no new table or role access.
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.service_payment_policy(uuid,uuid,uuid[],text) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.reserve_booking_with_payment(uuid,timestamptz,text,boolean,uuid,uuid[],text) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.service_payment_policy(uuid,uuid,uuid[],text),beauty.reserve_booking_with_payment(uuid,timestamptz,text,boolean,uuid,uuid[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.service_payment_policy(uuid,uuid,uuid[],text),beauty.reserve_booking_with_payment(uuid,timestamptz,text,boolean,uuid,uuid[],text) TO beauty_app;
-- The wrappers delegate to the existing restricted service-option entry points.
GRANT EXECUTE ON FUNCTION beauty.public_service_policy(uuid,uuid,uuid[]),beauty.reserve_booking(uuid,timestamptz,text,boolean,uuid,uuid[]) TO beauty_booking_ops;

-- Canonical function definitions recovered read-only from production, 2026-10-10.
-- Required by migration 0098's existing grants. No triggers are attached, no
-- policy values are changed, and this file is not applied to production.
-- Verification tiers already exist in the live schema used by this routine.
ALTER TABLE beauty.professional_trust_status
  ADD COLUMN IF NOT EXISTS identity_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS professional_verified boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION beauty.admin_set_professional_trust(target uuid, next_verification text, next_standing text, restrict_until timestamp with time zone, next_identity_verified boolean, next_business_verified boolean, next_professional_verified boolean, decision_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare actor uuid; target_user uuid;
begin
  actor := beauty.require_admin();

  if next_verification not in ('unverified','pending','verified','rejected')
    or next_standing not in ('good','restricted')
    or length(trim(decision_reason)) not between 5 and 500
    or (restrict_until is not null and restrict_until <= now()) then
    raise exception 'INVALID_REQUEST' using errcode='22023';
  end if;

  if next_business_verified and not next_identity_verified then
    raise exception 'BUSINESS_REQUIRES_IDENTITY' using errcode='22023';
  end if;
  if next_professional_verified and not next_identity_verified then
    raise exception 'PROFESSIONAL_REQUIRES_IDENTITY' using errcode='22023';
  end if;

  select user_id into target_user
  from beauty.professional_profiles
  where id=target;

  if target_user is null then
    raise exception 'NOT_FOUND' using errcode='22023';
  end if;

  insert into beauty.professional_trust_status(
    professional_id,verification_status,standing_status,live_restricted_until,
    identity_verified,business_verified,professional_verified,updated_at
  ) values(
    target,next_verification,next_standing,restrict_until,
    next_identity_verified,next_business_verified,next_professional_verified,now()
  )
  on conflict(professional_id) do update set
    verification_status=excluded.verification_status,
    standing_status=excluded.standing_status,
    live_restricted_until=excluded.live_restricted_until,
    identity_verified=excluded.identity_verified,
    business_verified=excluded.business_verified,
    professional_verified=excluded.professional_verified,
    updated_at=now();

  perform beauty.write_admin_audit(
    actor,'admin','professional.trust.changed',target_user,'professional',target,
    decision_reason,
    jsonb_build_object(
      'verification',next_verification,
      'identityVerified',next_identity_verified,
      'businessVerified',next_business_verified,
      'professionalVerified',next_professional_verified,
      'standing',next_standing,
      'liveRestrictedUntil',restrict_until
    )
  );
end
$function$;

CREATE OR REPLACE FUNCTION beauty.apply_verified_minimum_deposit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF NEW.verification_status='verified'
     AND coalesce(OLD.verification_status,'') IS DISTINCT FROM 'verified' THEN
    UPDATE beauty.services
    SET deposit_pence=ceil(price_pence * 0.15)::integer
    WHERE professional_id=NEW.professional_id
      AND active
      AND deposit_pence < ceil(price_pence * 0.15)::integer;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION beauty.enforce_service_deposit_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  verification text;
  minimum_deposit integer;
  maximum_deposit integer;
BEGIN
  IF NOT NEW.active THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(t.verification_status,'unverified')
  INTO verification
  FROM beauty.professional_profiles p
  LEFT JOIN beauty.professional_trust_status t
    ON t.professional_id=p.id
  WHERE p.id=NEW.professional_id;

  IF verification='verified' THEN
    minimum_deposit:=ceil(NEW.price_pence * 0.15)::integer;
    maximum_deposit:=floor(NEW.price_pence * 0.40)::integer;

    IF NEW.deposit_pence < minimum_deposit
       OR NEW.deposit_pence > maximum_deposit THEN
      RAISE EXCEPTION 'DEPOSIT_RANGE'
        USING ERRCODE='22023',
              DETAIL='Verified professional deposits must be between 15% and 40% of the service price.';
    END IF;
  ELSE
    IF NEW.price_pence > 20000 OR NEW.deposit_pence <> 0 THEN
      RAISE EXCEPTION 'VERIFICATION_REQUIRED'
        USING ERRCODE='22023';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION beauty.enforce_tiered_dispute_payout_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  open_dispute_count integer:=0;
  dispute_amount_total integer:=0;
  dispute_shortfall_total integer:=0;
  available_balance integer:=0;
  safety_buffer integer:=0;
BEGIN
  SELECT
    count(*)::integer,
    coalesce(sum(d.amount_pence),0)::integer,
    coalesce(sum(d.reserve_shortfall_pence),0)::integer
  INTO open_dispute_count,dispute_amount_total,dispute_shortfall_total
  FROM beauty.booking_disputes d
  JOIN beauty.bookings b ON b.id=d.booking_id
  WHERE b.professional_id=NEW.professional_id
    AND d.status IN (
      'warning_needs_response',
      'warning_under_review',
      'needs_response',
      'under_review'
    );

  IF open_dispute_count=0 THEN
    RETURN NEW;
  END IF;

  IF dispute_shortfall_total>0 OR open_dispute_count>=2 THEN
    RAISE EXCEPTION 'PAYOUT_RESTRICTED'
      USING ERRCODE='42501';
  END IF;

  SELECT greatest(
    0,
    coalesce(
      -sum(e.amount_pence) FILTER(WHERE a.code='professional_available'),
      0
    )
  )::integer
  INTO available_balance
  FROM beauty.financial_ledger_accounts a
  LEFT JOIN beauty.financial_ledger_entries e ON e.account_id=a.id
  WHERE a.professional_id=NEW.professional_id;

  safety_buffer:=ceil(dispute_amount_total*0.50)::integer;

  IF NEW.requested_pence > greatest(0,available_balance-safety_buffer) THEN
    RAISE EXCEPTION 'PAYOUT_DISPUTE_BUFFER'
      USING ERRCODE='22023';
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION beauty.enforce_verified_booking_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'beauty'
AS $function$
declare
  booking_row beauty.bookings%rowtype;
  current_user_id uuid;
begin
  select * into booking_row from beauty.bookings where id = new.booking_id;
  if booking_row.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if booking_row.status <> 'completed' or booking_row.completed_at is null then
    raise exception 'REVIEW_REQUIRES_COMPLETED_BOOKING';
  end if;

  select u.id into current_user_id
  from beauty.users u
  where u.auth_id = nullif(current_setting('app.auth_id', true), '')
  limit 1;

  if current_user_id is null or booking_row.customer_id <> current_user_id then
    raise exception 'REVIEW_NOT_BOOKING_CUSTOMER';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION beauty.enforce_verified_service_deposit_on_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  verified boolean:=false;
  service_price integer;
  service_deposit integer;
BEGIN
  SELECT coalesce(
    (beauty.professional_access_state(NEW.professional_id)->>'verified')::boolean,
    false
  )
  INTO verified;

  SELECT s.price_pence,s.deposit_pence
  INTO service_price,service_deposit
  FROM beauty.services s
  WHERE s.id=NEW.service_id
    AND s.professional_id=NEW.professional_id;

  IF verified THEN
    IF service_price IS NULL OR service_price<=0 THEN
      RAISE EXCEPTION 'INVALID_SERVICE_PRICE' USING ERRCODE='22023';
    END IF;

    IF service_deposit<ceil(service_price*0.15)
      OR service_deposit>floor(service_price*0.40) THEN
      RAISE EXCEPTION 'DEPOSIT_RANGE' USING ERRCODE='22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

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
    'usingDefault', active_rule.id IS NULL
  );
END
$function$;

CREATE OR REPLACE FUNCTION beauty.sync_professional_dispute_withdrawal_freeze()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_professional uuid;
  has_open_dispute boolean;
BEGIN
  SELECT b.professional_id
  INTO target_professional
  FROM beauty.bookings b
  WHERE b.id=NEW.booking_id;

  IF target_professional IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN (
    'warning_needs_response',
    'warning_under_review',
    'needs_response',
    'under_review'
  ) THEN
    INSERT INTO beauty.professional_financial_controls(professional_id)
    VALUES(target_professional)
    ON CONFLICT DO NOTHING;

    UPDATE beauty.professional_financial_controls
    SET withdrawals_blocked=true,
        instant_payout_blocked=true,
        review_status='under_review',
        updated_at=now()
    WHERE professional_id=target_professional;

    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM beauty.booking_disputes d
    JOIN beauty.bookings b ON b.id=d.booking_id
    WHERE b.professional_id=target_professional
      AND d.status IN (
        'warning_needs_response',
        'warning_under_review',
        'needs_response',
        'under_review'
      )
  )
  INTO has_open_dispute;

  IF NOT has_open_dispute THEN
    UPDATE beauty.professional_financial_controls
    SET withdrawals_blocked=false,
        instant_payout_blocked=false,
        review_status='clear',
        updated_at=now()
    WHERE professional_id=target_professional
      AND updated_by_user_id IS NULL
      AND review_status='under_review';
  END IF;

  RETURN NEW;
END
$function$;

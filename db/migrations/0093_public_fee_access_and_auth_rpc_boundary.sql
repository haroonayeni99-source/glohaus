-- A public fee is a scalar, not access to private finance policy records.
-- Keep the fee function SECURITY INVOKER; use the existing restricted catalogue
-- view boundary to read only the current public customer booking fee.
GRANT SELECT(id,transaction_kind,category_key,fee_payer,active,
  effective_from,effective_until,fixed_fee_pence)
  ON beauty.financial_fee_rules TO beauty_catalog;
CREATE POLICY catalog_public_customer_booking_fee
  ON beauty.financial_fee_rules FOR SELECT TO beauty_catalog
  USING(transaction_kind='booking' AND category_key IS NULL AND fee_payer='customer'
    AND active AND effective_from<=now()
    AND (effective_until IS NULL OR effective_until>now()));

CREATE VIEW beauty.public_booking_fee WITH (security_barrier=true) AS
  SELECT coalesce((SELECT fixed_fee_pence FROM beauty.financial_fee_rules
    WHERE transaction_kind='booking' AND category_key IS NULL AND fee_payer='customer'
      AND active AND effective_from<=now()
      AND (effective_until IS NULL OR effective_until>now())
    ORDER BY effective_from DESC,id DESC LIMIT 1),100)::integer AS fee_pence;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_booking_fee OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
REVOKE ALL ON beauty.public_booking_fee FROM PUBLIC;
GRANT SELECT ON beauty.public_booking_fee
  TO beauty_app,beauty_booking_ops,beauty_financial_worker,beauty_payment_worker;

CREATE OR REPLACE FUNCTION beauty.public_booking_fee_pence() RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$ SELECT fee_pence FROM beauty.public_booking_fee $$;
REVOKE ALL ON FUNCTION beauty.public_booking_fee_pence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.public_booking_fee_pence()
  TO beauty_app,beauty_booking_ops,beauty_financial_worker,beauty_payment_worker;

-- This table exists in the live Owner commission feature but is not part of
-- older repository snapshots. Preserve its deny-by-default browser access.
-- The sole existing restricted finance reader needs a SELECT policy, not a
-- public/professional write grant. Owner routines retain their existing checks.
DO $$ BEGIN
  IF to_regclass('beauty.professional_commission_overrides') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE beauty.professional_commission_overrides ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE beauty.professional_commission_overrides FORCE ROW LEVEL SECURITY';
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='beauty'
      AND tablename='professional_commission_overrides' AND policyname='commission_overrides_finance_read') THEN
      EXECUTE 'CREATE POLICY commission_overrides_finance_read ON beauty.professional_commission_overrides FOR SELECT TO beauty_financial_worker USING(true)';
    END IF;
    EXECUTE 'GRANT SELECT ON beauty.professional_commission_overrides TO beauty_financial_worker';
  END IF;
END $$;

-- Public PostgREST endpoints remain invoker functions. Privileged implementation
-- stays in a dedicated non-exposed schema and still derives identity from
-- auth.uid(), accepts only customer/professional, checks email verification,
-- and carries the account restrictions introduced in 0092.
CREATE SCHEMA beauty_private;
REVOKE ALL ON SCHEMA beauty_private FROM PUBLIC;
ALTER FUNCTION public.glohaus_my_account() SET SCHEMA beauty_private;
ALTER FUNCTION public.glohaus_enrol_self(text,boolean,boolean) SET SCHEMA beauty_private;

-- Reassert the checked implementation even when production used a separate
-- Supabase migration history for these existing account columns.
CREATE OR REPLACE FUNCTION beauty_private.glohaus_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  target_auth uuid;
  target_user beauty.users;
BEGIN
  target_auth:=auth.uid();
  IF target_auth IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  SELECT * INTO target_user
  FROM beauty.users
  WHERE auth_id=target_auth::text;

  IF target_user.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',target_user.id,
    'authId',target_user.auth_id,
    'email',target_user.email,
    'displayName',target_user.display_name,
    'status',target_user.status,
    'restrictedUntil',target_user.restricted_until,
    'deletedAt',target_user.deleted_at,
    'roles',coalesce((
      SELECT jsonb_agg(r.role ORDER BY r.role)
      FROM beauty.user_roles r
      WHERE r.user_id=target_user.id
    ),'[]'::jsonb),
    'professionalId',(
      SELECT p.id
      FROM beauty.professional_profiles p
      WHERE p.user_id=target_user.id
      LIMIT 1
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION beauty_private.glohaus_enrol_self(
  next_role text,
  adult_confirmed boolean DEFAULT false,
  professional_terms_accepted boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  target_auth uuid;
  auth_email text;
  target_user beauty.users;
  safe_display_name text;
BEGIN
  target_auth:=auth.uid();
  IF target_auth IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  IF next_role NOT IN ('customer','professional') THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  IF next_role='professional'
     AND (adult_confirmed IS DISTINCT FROM true
          OR professional_terms_accepted IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT email INTO auth_email
  FROM auth.users
  WHERE id=target_auth
    AND email IS NOT NULL
    AND email_confirmed_at IS NOT NULL;

  IF auth_email IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  safe_display_name:=left(split_part(auth_email,'@',1),120);
  IF length(safe_display_name)<1 THEN safe_display_name:='GLOHAUS user'; END IF;

  INSERT INTO beauty.users(auth_id,email,display_name)
  VALUES(target_auth::text,auth_email,safe_display_name)
  ON CONFLICT(auth_id) DO NOTHING;

  SELECT * INTO target_user
  FROM beauty.users
  WHERE auth_id=target_auth::text
  FOR UPDATE;

  IF target_user.id IS NULL OR target_user.status<>'active' OR target_user.deleted_at IS NOT NULL
     OR target_user.restricted_until>now() THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE' USING ERRCODE='42501';
  END IF;

  INSERT INTO beauty.user_roles(user_id,role)
  VALUES(target_user.id,next_role)
  ON CONFLICT DO NOTHING;

  IF next_role='professional' THEN
    INSERT INTO beauty.professional_profiles(user_id)
    VALUES(target_user.id)
    ON CONFLICT(user_id) DO NOTHING;
  ELSE
    INSERT INTO beauty.customer_profiles(user_id)
    VALUES(target_user.id)
    ON CONFLICT(user_id) DO NOTHING;
  END IF;

  RETURN beauty_private.glohaus_my_account();
END;
$fn$;

CREATE FUNCTION public.glohaus_my_account() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog
AS $$ SELECT beauty_private.glohaus_my_account() $$;
CREATE FUNCTION public.glohaus_enrol_self(next_role text,adult_confirmed boolean DEFAULT false,
  professional_terms_accepted boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog
AS $$ SELECT beauty_private.glohaus_enrol_self(next_role,adult_confirmed,professional_terms_accepted) $$;
REVOKE ALL ON FUNCTION public.glohaus_my_account(),public.glohaus_enrol_self(text,boolean,boolean),
  beauty_private.glohaus_my_account(),beauty_private.glohaus_enrol_self(text,boolean,boolean) FROM PUBLIC;
DO $$ DECLARE target_role text; BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=target_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.glohaus_my_account(),public.glohaus_enrol_self(text,boolean,boolean),beauty_private.glohaus_my_account(),beauty_private.glohaus_enrol_self(text,boolean,boolean) FROM %I',target_role);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    GRANT USAGE ON SCHEMA beauty_private TO authenticated;
    GRANT EXECUTE ON FUNCTION public.glohaus_my_account(),public.glohaus_enrol_self(text,boolean,boolean),
      beauty_private.glohaus_my_account(),beauty_private.glohaus_enrol_self(text,boolean,boolean) TO authenticated;
  END IF;
END $$;

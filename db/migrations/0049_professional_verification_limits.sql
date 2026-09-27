-- Professional verification and starter marketplace limits.
-- Stripe Connect remains the KYC provider. GLOHAUS stores only trust state.

INSERT INTO beauty.professional_trust_status(professional_id)
SELECT id FROM beauty.professional_profiles
ON CONFLICT(professional_id) DO NOTHING;

GRANT SELECT ON beauty.professional_payment_accounts TO beauty_admin_ops;
DROP POLICY IF EXISTS connect_admin_read ON beauty.professional_payment_accounts;
CREATE POLICY connect_admin_read
ON beauty.professional_payment_accounts
FOR SELECT TO beauty_admin_ops USING(true);

GRANT SELECT ON beauty.professional_trust_status TO beauty_catalog;
DROP POLICY IF EXISTS catalog_professional_trust ON beauty.professional_trust_status;
CREATE POLICY catalog_professional_trust
ON beauty.professional_trust_status
FOR SELECT TO beauty_catalog USING(true);

CREATE OR REPLACE FUNCTION beauty.professional_access_state(target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  verification text;
  standing text;
  payment_ready boolean;
  payment_exists boolean;
  effective text;
  starter_used integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=target) THEN
    RETURN jsonb_build_object(
      'status','restricted',
      'verified',false,
      'paymentReady',false,
      'starterBookingsUsed',0,
      'starterBookingsRemaining',0
    );
  END IF;

  SELECT
    coalesce(t.verification_status,'unverified'),
    coalesce(t.standing_status,'good'),
    coalesce(pa.charges_enabled,false),
    pa.professional_id IS NOT NULL
  INTO verification,standing,payment_ready,payment_exists
  FROM beauty.professional_profiles p
  LEFT JOIN beauty.professional_trust_status t ON t.professional_id=p.id
  LEFT JOIN beauty.professional_payment_accounts pa ON pa.professional_id=p.id
  WHERE p.id=target;

  SELECT count(*)::integer INTO starter_used
  FROM beauty.bookings
  WHERE professional_id=target
    AND status IN('confirmed','completed','no_show');

  effective :=
    CASE
      WHEN standing='restricted' OR verification='rejected' THEN 'restricted'
      WHEN verification='verified' THEN 'verified'
      WHEN verification='pending' OR payment_exists THEN 'pending'
      ELSE 'unverified'
    END;

  RETURN jsonb_build_object(
    'status',effective,
    'verified',effective='verified',
    'paymentReady',payment_ready,
    'starterBookingsUsed',starter_used,
    'starterBookingsRemaining',
      CASE WHEN effective='verified' THEN NULL ELSE greatest(0,5-starter_used) END
  );
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.professional_access_state(uuid) OWNER TO beauty_admin_ops;

CREATE OR REPLACE FUNCTION beauty.sync_connect_verification(
  account_ref text,
  provider_ready boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  target uuid;
BEGIN
  SELECT professional_id INTO target
  FROM beauty.professional_payment_accounts
  WHERE stripe_account_id=account_ref;

  IF target IS NULL THEN RETURN; END IF;

  INSERT INTO beauty.professional_trust_status(
    professional_id,verification_status,standing_status,updated_at
  ) VALUES(
    target,
    CASE WHEN provider_ready THEN 'verified' ELSE 'pending' END,
    'good',
    now()
  )
  ON CONFLICT(professional_id) DO UPDATE SET
    verification_status=
      CASE
        WHEN provider_ready THEN 'verified'
        WHEN beauty.professional_trust_status.verification_status='rejected'
          THEN 'rejected'
        ELSE 'pending'
      END,
    updated_at=now();
END $$;

ALTER FUNCTION beauty.sync_connect_verification(text,boolean) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;

REVOKE ALL ON FUNCTION
  beauty.professional_access_state(uuid),
  beauty.sync_connect_verification(text,boolean)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION beauty.professional_access_state(uuid)
TO beauty_app,beauty_booking_ops;

GRANT EXECUTE ON FUNCTION beauty.sync_connect_verification(text,boolean)
TO beauty_payment_worker;

CREATE OR REPLACE VIEW beauty.public_professionals
WITH (security_barrier=true)
AS
SELECT
  p.id,
  p.slug,
  p.business_name,
  p.bio,
  p.city,
  p.category,
  CASE
    WHEN coalesce(t.standing_status,'good')='restricted'
      OR coalesce(t.verification_status,'unverified')='rejected'
      THEN 'restricted'
    ELSE coalesce(t.verification_status,'unverified')
  END AS verification_status
FROM beauty.professional_profiles p
LEFT JOIN beauty.professional_trust_status t ON t.professional_id=p.id
WHERE p.publication_status='published';

GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_professionals OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_professionals TO beauty_app;

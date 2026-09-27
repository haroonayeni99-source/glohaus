-- Verification is required before a professional can withdraw earnings.
-- This guard is called by the authenticated payout API before a payout request
-- is inserted into the protected ledger.

CREATE OR REPLACE FUNCTION beauty.assert_my_professional_verified()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  target uuid;
  access jsonb;
BEGIN
  SELECT p.id INTO target
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active';

  IF target IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT beauty.professional_access_state(target) INTO access;

  IF coalesce(access->>'status','restricted')='restricted' THEN
    RAISE EXCEPTION 'PROFESSIONAL_RESTRICTED' USING ERRCODE='42501';
  END IF;

  IF coalesce((access->>'verified')::boolean,false)=false THEN
    RAISE EXCEPTION 'VERIFICATION_REQUIRED' USING ERRCODE='42501';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION beauty.professional_access_state(uuid)
TO beauty_financial_worker;

GRANT CREATE ON SCHEMA beauty TO beauty_financial_worker;
ALTER FUNCTION beauty.assert_my_professional_verified() OWNER TO beauty_financial_worker;
REVOKE CREATE ON SCHEMA beauty FROM beauty_financial_worker;

REVOKE ALL ON FUNCTION beauty.assert_my_professional_verified() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.assert_my_professional_verified() TO beauty_app;

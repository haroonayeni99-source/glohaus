-- Server-authoritative GLOHAUS LIVE eligibility.
-- Verification and standing are operator-controlled; professionals cannot self-approve.
CREATE TABLE beauty.professional_trust_status (
  professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK(verification_status IN ('unverified','pending','verified','rejected')),
  standing_status text NOT NULL DEFAULT 'good'
    CHECK(standing_status IN ('good','restricted')),
  live_restricted_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beauty.professional_trust_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_trust_status FORCE ROW LEVEL SECURITY;

GRANT SELECT ON beauty.professional_trust_status TO beauty_app;
CREATE POLICY professional_trust_owner_read ON beauty.professional_trust_status
  FOR SELECT TO beauty_app
  USING(EXISTS(
    SELECT 1 FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status='active'
  ));

GRANT SELECT,INSERT,UPDATE ON beauty.professional_trust_status TO beauty_admin_ops;
CREATE POLICY professional_trust_admin ON beauty.professional_trust_status
  FOR ALL TO beauty_admin_ops USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.live_eligibility(target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  actor uuid;
  owner_user uuid;
  followers integer;
  completed integer;
  verification text;
  standing text;
  restricted_until timestamptz;
  recent_serious_reports integer;
BEGIN
  SELECT p.user_id INTO owner_user
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  WHERE p.id=target AND u.status='active';

  SELECT u.id INTO actor FROM beauty.users u
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  IF actor IS NULL OR owner_user IS NULL OR actor<>owner_user THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT count(*)::integer INTO followers
    FROM beauty.professional_follows WHERE professional_id=target;
  SELECT count(*)::integer INTO completed
    FROM beauty.bookings WHERE professional_id=target AND status='completed';
  SELECT verification_status,standing_status,live_restricted_until
    INTO verification,standing,restricted_until
    FROM beauty.professional_trust_status WHERE professional_id=target;

  verification:=coalesce(verification,'unverified');
  standing:=coalesce(standing,'good');

  -- An unresolved serious report blocks LIVE until an operator resolves it.
  SELECT count(*)::integer INTO recent_serious_reports
  FROM beauty.safety_reports
  WHERE target_type='professional' AND target_id=target
    AND status IN ('open','under_review')
    AND lower(category) IN ('safety','fraud','harassment','abuse','sexual content','dangerous activity');

  RETURN jsonb_build_object(
    'eligible',
      verification='verified'
      AND standing='good'
      AND followers>=500
      AND completed>=10
      AND recent_serious_reports=0
      AND (restricted_until IS NULL OR restricted_until<=now()),
    'followers',followers,
    'followersRequired',500,
    'completedBookings',completed,
    'completedBookingsRequired',10,
    'verified',verification='verified',
    'verificationStatus',verification,
    'goodStanding',standing='good',
    'seriousModerationRestriction',recent_serious_reports>0 OR (restricted_until IS NOT NULL AND restricted_until>now()),
    'liveRestrictedUntil',restricted_until
  );
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.live_eligibility(uuid) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.live_eligibility(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.live_eligibility(uuid) TO beauty_app;

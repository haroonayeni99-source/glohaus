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

  SELECT beauty.professional_follower_count(target) INTO followers;
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

-- Admin-only trust decisions. Every change is written to the existing audit log.
CREATE FUNCTION beauty.admin_set_professional_trust(
  target uuid,
  next_verification text,
  next_standing text,
  restrict_until timestamptz,
  decision_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; target_user uuid;
BEGIN
  actor:=beauty.require_admin();
  IF next_verification NOT IN ('unverified','pending','verified','rejected')
    OR next_standing NOT IN ('good','restricted')
    OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500
    OR (restrict_until IS NOT NULL AND restrict_until<=now()) THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  SELECT user_id INTO target_user FROM beauty.professional_profiles WHERE id=target;
  IF target_user IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;

  INSERT INTO beauty.professional_trust_status(
    professional_id,verification_status,standing_status,live_restricted_until,updated_at
  ) VALUES(target,next_verification,next_standing,restrict_until,now())
  ON CONFLICT(professional_id) DO UPDATE SET
    verification_status=excluded.verification_status,
    standing_status=excluded.standing_status,
    live_restricted_until=excluded.live_restricted_until,
    updated_at=now();

  PERFORM beauty.write_admin_audit(
    actor,'admin','professional.trust.changed',target_user,'professional',target,
    decision_reason,
    jsonb_build_object('verification',next_verification,'standing',next_standing,'liveRestrictedUntil',restrict_until)
  );
END $$;

ALTER FUNCTION beauty.admin_set_professional_trust(uuid,text,text,timestamptz,text) OWNER TO beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.admin_set_professional_trust(uuid,text,text,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_set_professional_trust(uuid,text,text,timestamptz,text) TO beauty_app;

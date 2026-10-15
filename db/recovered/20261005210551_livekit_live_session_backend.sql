CREATE TABLE IF NOT EXISTS beauty.live_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
  room_name text NOT NULL UNIQUE CHECK (room_name ~ '^ghlive_[a-f0-9]{32}$'),
  title text NOT NULL DEFAULT 'LIVE now' CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='live' AND ended_at IS NULL) OR (status='ended' AND ended_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_live_session_per_professional
ON beauty.live_sessions(professional_id)
WHERE status='live';

ALTER TABLE beauty.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.live_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE beauty.live_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE beauty.live_sessions TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.start_my_live_session(session_title text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  target_professional uuid;
  eligibility jsonb;
  existing beauty.live_sessions;
  result beauty.live_sessions;
  clean_title text;
BEGIN
  SELECT p.id INTO target_professional
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  IF target_professional IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT beauty.live_eligibility(target_professional) INTO eligibility;
  IF NOT coalesce((eligibility->>'eligible')::boolean,false) THEN
    RAISE EXCEPTION 'LIVE_NOT_ELIGIBLE' USING ERRCODE='42501';
  END IF;

  clean_title:=trim(coalesce(session_title,''));
  IF char_length(clean_title) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT * INTO existing
  FROM beauty.live_sessions
  WHERE professional_id=target_professional AND status='live'
  FOR UPDATE;

  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id',existing.id,
      'roomName',existing.room_name,
      'title',existing.title,
      'status',existing.status,
      'startedAt',existing.started_at
    );
  END IF;

  INSERT INTO beauty.live_sessions(
    professional_id,room_name,title,status,started_at
  )
  VALUES(
    target_professional,
    'ghlive_'||replace(gen_random_uuid()::text,'-',''),
    clean_title,
    'live',
    now()
  )
  RETURNING * INTO result;

  RETURN jsonb_build_object(
    'id',result.id,
    'roomName',result.room_name,
    'title',result.title,
    'status',result.status,
    'startedAt',result.started_at
  );
END
$$;

CREATE OR REPLACE FUNCTION beauty.end_my_live_session(target_session uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  target_professional uuid;
BEGIN
  SELECT p.id INTO target_professional
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';

  IF target_professional IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  UPDATE beauty.live_sessions
  SET status='ended',ended_at=now()
  WHERE id=target_session
    AND professional_id=target_professional
    AND status='live';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION beauty.live_session_join_info(target_session uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor uuid;
  result record;
BEGIN
  SELECT u.id INTO actor
  FROM beauty.users u
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active'
    AND u.deleted_at IS NULL;

  IF actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT
    s.id,s.room_name,s.title,s.started_at,s.professional_id,
    p.business_name,p.slug
  INTO result
  FROM beauty.live_sessions s
  JOIN beauty.professional_profiles p ON p.id=s.professional_id
  JOIN beauty.users u ON u.id=p.user_id AND u.status='active'
  WHERE s.id=target_session
    AND s.status='live'
    AND p.publication_status='published';

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'LIVE_NOT_FOUND' USING ERRCODE='22023';
  END IF;

  RETURN jsonb_build_object(
    'id',result.id,
    'roomName',result.room_name,
    'title',result.title,
    'startedAt',result.started_at,
    'professionalId',result.professional_id,
    'businessName',result.business_name,
    'slug',result.slug
  );
END
$$;

REVOKE ALL ON FUNCTION beauty.start_my_live_session(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION beauty.end_my_live_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION beauty.live_session_join_info(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION beauty.start_my_live_session(text) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.end_my_live_session(uuid) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.live_session_join_info(uuid) TO beauty_app;

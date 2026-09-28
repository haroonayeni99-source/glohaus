-- Professional compliance gate for 18+ provider accounts.
-- Stripe Connect remains the identity/KYC provider. GLOHAUS stores only the
-- provider's explicit 18+ and Professional Terms acknowledgement.

CREATE TABLE IF NOT EXISTS beauty.professional_compliance_acknowledgements (
  professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
  adult_confirmed boolean NOT NULL CHECK (adult_confirmed),
  professional_terms_version text NOT NULL CHECK (length(professional_terms_version) BETWEEN 1 AND 80),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beauty.professional_compliance_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_compliance_acknowledgements OWNER TO beauty_admin_ops;
REVOKE ALL ON beauty.professional_compliance_acknowledgements FROM PUBLIC;

CREATE OR REPLACE FUNCTION beauty.my_professional_compliance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  target uuid;
  ack beauty.professional_compliance_acknowledgements%ROWTYPE;
BEGIN
  SELECT p.id INTO target
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active'
  LIMIT 1;

  IF target IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO ack
  FROM beauty.professional_compliance_acknowledgements
  WHERE professional_id=target;

  RETURN jsonb_build_object(
    'adultConfirmed', coalesce(ack.adult_confirmed,false),
    'termsAccepted', ack.professional_id IS NOT NULL,
    'termsVersion', ack.professional_terms_version,
    'acceptedAt', ack.accepted_at
  );
END $$;

CREATE OR REPLACE FUNCTION beauty.accept_my_professional_compliance(terms_version text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  target uuid;
BEGIN
  IF terms_version IS NULL OR length(trim(terms_version)) < 1 OR length(terms_version) > 80 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT p.id INTO target
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active'
  LIMIT 1;

  IF target IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  INSERT INTO beauty.professional_compliance_acknowledgements(
    professional_id, adult_confirmed, professional_terms_version, accepted_at, updated_at
  ) VALUES(target,true,trim(terms_version),now(),now())
  ON CONFLICT(professional_id) DO UPDATE SET
    adult_confirmed=true,
    professional_terms_version=excluded.professional_terms_version,
    accepted_at=excluded.accepted_at,
    updated_at=now();

  RETURN beauty.my_professional_compliance();
END $$;

ALTER FUNCTION beauty.my_professional_compliance() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.accept_my_professional_compliance(text) OWNER TO beauty_admin_ops;

REVOKE ALL ON FUNCTION beauty.my_professional_compliance() FROM PUBLIC;
REVOKE ALL ON FUNCTION beauty.accept_my_professional_compliance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.my_professional_compliance() TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.accept_my_professional_compliance(text) TO beauty_app;

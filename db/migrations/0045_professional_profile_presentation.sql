-- Paid professional storefront presentation settings.
-- Starter uses the standard presentation. Pro/Premium can save presentation
-- choices while their paid subscription is active.

CREATE TABLE beauty.professional_profile_presentation (
  professional_id uuid PRIMARY KEY
    REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
  profile_style text NOT NULL DEFAULT 'signature'
    CHECK(profile_style IN ('signature','minimal','editorial')),
  portfolio_layout text NOT NULL DEFAULT 'grid'
    CHECK(portfolio_layout IN ('grid','feature')),
  service_style text NOT NULL DEFAULT 'cards'
    CHECK(service_style IN ('cards','clean')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beauty.professional_profile_presentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_profile_presentation FORCE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE ON beauty.professional_profile_presentation TO beauty_app;
GRANT SELECT,DELETE ON beauty.professional_profile_presentation TO beauty_payment_worker;

CREATE POLICY professional_profile_presentation_read
ON beauty.professional_profile_presentation
FOR SELECT TO beauty_app
USING(
  EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.status='active'
      AND (
        u.auth_id=beauty.auth_id()
        OR p.publication_status='published'
      )
  )
);

CREATE POLICY professional_profile_presentation_insert
ON beauty.professional_profile_presentation
FOR INSERT TO beauty_app
WITH CHECK(
  EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
  AND EXISTS(
    SELECT 1
    FROM beauty.professional_subscriptions s
    WHERE s.professional_id=professional_id
      AND s.status='active'
      AND s.plan_key IN ('pro','premium')
  )
);

CREATE POLICY professional_profile_presentation_update
ON beauty.professional_profile_presentation
FOR UPDATE TO beauty_app
USING(
  EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
)
WITH CHECK(
  EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
  AND EXISTS(
    SELECT 1
    FROM beauty.professional_subscriptions s
    WHERE s.professional_id=professional_id
      AND s.status='active'
      AND s.plan_key IN ('pro','premium')
  )
);

CREATE POLICY professional_profile_presentation_payment_cleanup
ON beauty.professional_profile_presentation
FOR DELETE TO beauty_payment_worker
USING(true);

CREATE FUNCTION beauty.clear_inactive_profile_presentation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NEW.status<>'active' OR NEW.plan_key NOT IN ('pro','premium') THEN
    DELETE FROM beauty.professional_profile_presentation
    WHERE professional_id=NEW.professional_id;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION beauty.clear_inactive_profile_presentation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.clear_inactive_profile_presentation()
  TO beauty_payment_worker;

CREATE TRIGGER professional_subscription_presentation_cleanup
AFTER INSERT OR UPDATE OF plan_key,status
ON beauty.professional_subscriptions
FOR EACH ROW
EXECUTE FUNCTION beauty.clear_inactive_profile_presentation();

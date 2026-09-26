-- Expose only safe storefront presentation fields through the same narrow
-- public-view pattern used by the rest of the published professional profile.

DROP POLICY IF EXISTS professional_profile_presentation_read
  ON beauty.professional_profile_presentation;

CREATE POLICY professional_profile_presentation_owner_read
ON beauty.professional_profile_presentation
FOR SELECT TO beauty_app
USING(
  EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

CREATE VIEW beauty.public_profile_presentation AS
SELECT
  presentation.professional_id,
  presentation.profile_style,
  presentation.portfolio_layout,
  presentation.service_style
FROM beauty.professional_profile_presentation presentation
JOIN beauty.professional_profiles profile
  ON profile.id=presentation.professional_id
JOIN beauty.users owner_user
  ON owner_user.id=profile.user_id
JOIN beauty.professional_subscriptions subscription
  ON subscription.professional_id=presentation.professional_id
WHERE profile.publication_status='published'
  AND owner_user.status='active'
  AND subscription.status='active'
  AND subscription.plan_key IN ('pro','premium');

REVOKE ALL ON beauty.public_profile_presentation FROM PUBLIC;
GRANT SELECT ON beauty.public_profile_presentation TO beauty_app;

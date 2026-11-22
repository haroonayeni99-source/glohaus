-- Deliberately outside the production migration runner. Apply only after
-- verified recovery arrangements and isolated acceptance; then enable the flag.
CREATE TABLE beauty.calendar_subscriptions (
 professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id),
 token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beauty.calendar_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.calendar_subscriptions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.calendar_subscriptions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.calendar_subscriptions TO beauty_app;
CREATE POLICY subscription_owner ON beauty.calendar_subscriptions TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())))
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=professional_id AND u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())));

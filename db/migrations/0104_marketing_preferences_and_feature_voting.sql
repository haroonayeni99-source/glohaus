-- Marketing preferences and private feature voting.
CREATE TABLE IF NOT EXISTS beauty.marketing_preferences(
  user_id uuid PRIMARY KEY REFERENCES beauty.users(id) ON DELETE CASCADE,
  customer_offers boolean NOT NULL DEFAULT false,
  new_professionals boolean NOT NULL DEFAULT false,
  availability boolean NOT NULL DEFAULT false,
  discover boolean NOT NULL DEFAULT false,
  shop boolean NOT NULL DEFAULT false,
  rebooking boolean NOT NULL DEFAULT false,
  professional_growth boolean NOT NULL DEFAULT false,
  marketplace_features boolean NOT NULL DEFAULT false,
  professional_promotions boolean NOT NULL DEFAULT false,
  academy boolean NOT NULL DEFAULT false,
  milestones boolean NOT NULL DEFAULT false,
  shop_selling boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beauty.feature_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK(audience IN('customer','professional','all')),
  title text NOT NULL CHECK(length(title) BETWEEN 5 AND 140),
  description text NOT NULL CHECK(length(description) BETWEEN 10 AND 800),
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','planned','building','released','closed')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES beauty.users(id)
);

CREATE TABLE IF NOT EXISTS beauty.feature_votes(
  feature_id uuid NOT NULL REFERENCES beauty.feature_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(feature_id,user_id)
);

ALTER TABLE beauty.marketing_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.marketing_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.feature_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.feature_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.feature_votes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE beauty.marketing_preferences,beauty.feature_requests,beauty.feature_votes
FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.marketing_preferences,beauty.feature_requests,beauty.feature_votes TO beauty_app;

-- Functions are intentionally SECURITY DEFINER because direct table access is denied.
-- They resolve the current GLOHAUS user from beauty.auth_id(), enforce Owner where required,
-- and return only preference/vote data needed by the UI.

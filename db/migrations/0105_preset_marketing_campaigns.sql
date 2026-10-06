-- Preset marketing campaigns and queued delivery.
CREATE TABLE IF NOT EXISTS beauty.marketing_campaigns(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_key text NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  audience text NOT NULL CHECK(audience IN('customer','professional')),
  preference_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','sending','sent','cancelled')),
  cta_url text NOT NULL,
  launched_by uuid REFERENCES beauty.users(id),
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  booking_value_pence integer NOT NULL DEFAULT 0,
  glohaus_revenue_pence integer NOT NULL DEFAULT 0,
  promotion_cost_pence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS beauty.marketing_outbox(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES beauty.marketing_campaigns(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  cta_url text NOT NULL,
  due_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  claimed_until timestamptz,
  provider_email_id text,
  last_error text,
  UNIQUE(campaign_id,recipient_user_id)
);

CREATE INDEX IF NOT EXISTS marketing_outbox_due_idx
  ON beauty.marketing_outbox(due_at) WHERE sent_at IS NULL;

ALTER TABLE beauty.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.marketing_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.marketing_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.marketing_outbox FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE beauty.marketing_campaigns,beauty.marketing_outbox
FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.marketing_campaigns,beauty.marketing_outbox TO beauty_app;
GRANT SELECT,UPDATE ON beauty.marketing_campaigns,beauty.marketing_outbox TO beauty_payment_worker;

ALTER TABLE beauty.marketing_preferences
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS marketing_preferences_unsubscribe_token_idx
  ON beauty.marketing_preferences(unsubscribe_token);

-- Production also contains the associated functions:
-- beauty.owner_launch_marketing_preset(text)
-- beauty.claim_marketing_notifications()
-- beauty.finish_marketing_notification(uuid,boolean,text)
-- beauty.unsubscribe_marketing(uuid)
-- beauty.owner_marketing_overview()
-- plus preference and feature-vote functions from the preceding migration.

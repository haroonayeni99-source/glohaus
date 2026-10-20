-- Recovered schema-only fixture for isolated PGlite migration tests.
-- Production customer-referral objects predate these repository migrations.
CREATE TABLE IF NOT EXISTS beauty.customer_referral_codes (
 user_id uuid PRIMARY KEY REFERENCES beauty.users(id) ON DELETE CASCADE,
 code text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS beauty.customer_referrals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 referrer_user_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
 referred_user_id uuid NOT NULL UNIQUE REFERENCES beauty.users(id) ON DELETE CASCADE,
 referral_code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beauty.customer_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.customer_referral_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.customer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.customer_referrals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.customer_referral_codes, beauty.customer_referrals FROM PUBLIC,anon,authenticated;

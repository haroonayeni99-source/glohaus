-- Additive, privacy-limited growth instrumentation. NO transfer, wallet, or reward mutations.
-- Apply in an approved migration window before enabling corresponding routes.
CREATE TABLE IF NOT EXISTS beauty.growth_profile_attribution (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
 consented_at timestamptz NOT NULL,
 viewed_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
 CONSTRAINT growth_attribution_ttl CHECK (expires_at <= viewed_at + interval '7 days' AND expires_at > viewed_at)
);
CREATE INDEX IF NOT EXISTS growth_profile_attribution_match_idx
 ON beauty.growth_profile_attribution(customer_id,professional_id,viewed_at DESC);
CREATE INDEX IF NOT EXISTS growth_profile_attribution_expire_idx
 ON beauty.growth_profile_attribution(expires_at);
ALTER TABLE beauty.growth_profile_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.growth_profile_attribution FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.growth_profile_attribution FROM PUBLIC,anon,authenticated,beauty_app;

CREATE TABLE IF NOT EXISTS beauty.growth_booking_attribution (
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id) ON DELETE CASCADE,
 view_id uuid NOT NULL REFERENCES beauty.growth_profile_attribution(id) ON DELETE CASCADE,
 captured_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beauty.growth_booking_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.growth_booking_attribution FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.growth_booking_attribution FROM PUBLIC,anon,authenticated,beauty_app;

-- Audit remains server-controlled; no browser role receives direct table permissions.
CREATE TABLE IF NOT EXISTS beauty.growth_referral_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 referral_kind text NOT NULL CHECK(referral_kind IN ('customer','professional')),
 referral_id uuid NOT NULL,
 old_status text,
 new_status text NOT NULL CHECK(new_status IN ('attributed','pending','qualified','flagged','rejected','reversed')),
 reason_code text NOT NULL CHECK(reason_code ~ '^[A-Z_]{3,64}$'),
 actor_user_id uuid REFERENCES beauty.users(id) ON DELETE SET NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 idempotency_key text UNIQUE NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 200)
);
CREATE INDEX IF NOT EXISTS growth_referral_audit_ref_idx
 ON beauty.growth_referral_audit(referral_kind,referral_id,occurred_at DESC);
ALTER TABLE beauty.growth_referral_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.growth_referral_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.growth_referral_audit FROM PUBLIC,anon,authenticated,beauty_app;

-- Owner nomination and acknowledgement ledger; zero financial side effects.
CREATE TABLE IF NOT EXISTS beauty.professional_appreciation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),
 gift_description text CHECK(length(gift_description)<=500),
 proposed_value_pence integer NOT NULL DEFAULT 0 CHECK(proposed_value_pence BETWEEN 0 AND 10000000),
 state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','approved','cancelled','fulfilled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 approved_at timestamptz,
 fulfilled_at timestamptz
);
ALTER TABLE beauty.professional_appreciation ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_appreciation FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.professional_appreciation FROM PUBLIC,anon,authenticated,beauty_app;

-- Do not grant execution to any app role until write/read functions are reviewed.
-- No automated referral rewards, notifications, gifts or money movement.

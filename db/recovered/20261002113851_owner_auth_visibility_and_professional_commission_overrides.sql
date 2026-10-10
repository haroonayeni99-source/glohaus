-- Recovered table DDL from the matching Supabase migration history, 2026-10-10.
-- Schema prerequisites only; no payment functions, data backfills, or live writes.
CREATE TABLE IF NOT EXISTS beauty.professional_commission_overrides (
  professional_id uuid PRIMARY KEY REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
  service_commission_basis_points integer NOT NULL CHECK (service_commission_basis_points BETWEEN 0 AND 5000),
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 5 AND 500),
  effective_until timestamptz,
  updated_by_user_id uuid NOT NULL REFERENCES beauty.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beauty.professional_commission_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.professional_commission_overrides FROM PUBLIC, anon, authenticated;

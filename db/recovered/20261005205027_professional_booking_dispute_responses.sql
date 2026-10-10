-- Recovered table DDL from the matching Supabase migration history, 2026-10-10.
-- Schema prerequisites only; no payment functions, data backfills, or live writes.
CREATE TABLE IF NOT EXISTS beauty.booking_dispute_responses(
  dispute_id uuid PRIMARY KEY REFERENCES beauty.booking_disputes(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
  statement text NOT NULL CHECK (char_length(trim(statement)) BETWEEN 20 AND 4000),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beauty.booking_dispute_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.booking_dispute_responses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE beauty.booking_dispute_responses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE beauty.booking_dispute_responses TO beauty_app;

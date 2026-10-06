-- Mirrors the production backend_foreign_key_indexes migration.
-- Idempotent so it is safe once migration histories are reconciled.

CREATE INDEX IF NOT EXISTS booking_dispute_responses_professional_idx
  ON beauty.booking_dispute_responses(professional_id);

CREATE INDEX IF NOT EXISTS platform_runtime_settings_updated_by_idx
  ON beauty.platform_runtime_settings(updated_by);

CREATE INDEX IF NOT EXISTS platform_settings_updated_by_idx
  ON beauty.platform_settings(updated_by);

CREATE INDEX IF NOT EXISTS professional_commission_overrides_updated_by_user_idx
  ON beauty.professional_commission_overrides(updated_by_user_id);

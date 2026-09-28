-- Remove the legacy zero-deposit blocker left behind by the original
-- financial_quotes table definition. Migration 0041 added the correct
-- payable_now_pence >= 0 constraint but the original unnamed check remained,
-- so Starter bookings with a £0 deposit could not create their £1 fee quote.

ALTER TABLE beauty.financial_quotes
  DROP CONSTRAINT IF EXISTS financial_quotes_check;

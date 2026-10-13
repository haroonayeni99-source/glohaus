-- Match the existing, verified live Stripe monthly prices.
-- Pro: price_1UNuuOV059Un1dlnDgFtC0Nb (£9.99).
-- Premium: price_1UNuvBV059Un1dlnzLRXQg66 (£19.99).
-- This corrects the catalogue/display and revenue reporting only: no provider
-- price, subscription, commission, withdrawal or booking-fee changes.
UPDATE beauty.professional_plan_definitions
SET monthly_price_pence = CASE plan_key WHEN 'pro' THEN 999 WHEN 'premium' THEN 1999 END
WHERE plan_key IN ('pro','premium');

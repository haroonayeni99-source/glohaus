-- GBP card charges below 30p are not supported by Stripe.
ALTER TABLE beauty.services ADD CONSTRAINT minimum_deposit CHECK(deposit_pence=0 OR deposit_pence>=30);

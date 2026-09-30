-- Keep fresh databases aligned with the live payment-worker booking access
-- needed to map signed Stripe disputes back to their booking/professional.
-- Read-only; forced RLS remains enabled.

GRANT SELECT ON beauty.bookings TO beauty_payment_worker;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname='beauty'
      AND tablename='bookings'
      AND policyname='booking_finance_worker_bookings'
  ) THEN
    CREATE POLICY booking_finance_worker_bookings
    ON beauty.bookings
    FOR SELECT TO beauty_payment_worker
    USING (true);
  END IF;
END
$$;

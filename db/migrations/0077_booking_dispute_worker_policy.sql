-- Explicit dispute-worker booking read policy.
-- Kept separate from older finance policies so fresh PostgreSQL/PGlite
-- databases and production enforce the same least-privilege access.

GRANT SELECT ON beauty.bookings TO beauty_payment_worker;

CREATE POLICY booking_dispute_payment_worker_read
ON beauty.bookings
FOR SELECT TO beauty_payment_worker
USING (true);

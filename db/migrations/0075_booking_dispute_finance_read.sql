-- Allow the finance worker to read booking dispute status when deciding
-- whether completed booking proceeds are mature enough to release.
-- This is read-only and remains behind forced RLS.

GRANT SELECT ON beauty.booking_disputes TO beauty_financial_worker;

CREATE POLICY booking_disputes_financial_worker_read
ON beauty.booking_disputes
FOR SELECT TO beauty_financial_worker
USING (true);

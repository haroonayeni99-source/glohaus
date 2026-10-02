-- Both payment-worker booking SELECT policies were identical.
-- Keep the dispute policy and remove the redundant duplicate.
DROP POLICY IF EXISTS booking_finance_worker_bookings ON beauty.bookings;

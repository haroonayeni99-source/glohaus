-- Checkout resume needs only the immutable customer total, never professional
-- commission or platform accounting fields.
CREATE POLICY financial_quote_booking_customer_read
ON beauty.financial_quotes
FOR SELECT TO beauty_app
USING (
  EXISTS (
    SELECT 1
    FROM beauty.bookings b
    JOIN beauty.users u ON u.id=b.customer_id
    WHERE b.id=financial_quotes.booking_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

GRANT SELECT(booking_id,customer_total_pence)
ON beauty.financial_quotes TO beauty_app;

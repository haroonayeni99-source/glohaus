-- Stable keyset pagination for customer and professional appointment lists.
CREATE INDEX bookings_customer_start_id ON beauty.bookings(customer_id,starts_at,id);
CREATE INDEX bookings_professional_start_id ON beauty.bookings(professional_id,starts_at,id);

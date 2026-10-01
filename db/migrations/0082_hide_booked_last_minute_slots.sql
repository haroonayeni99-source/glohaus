CREATE OR REPLACE VIEW beauty.public_last_minute_slots AS
SELECT
  slot.id,
  slot.professional_id,
  slot.service_id,
  slot.starts_at,
  slot.ends_at,
  slot.caption,
  slot.expires_at,
  p.slug,
  p.business_name,
  p.city,
  p.category,
  service.name AS service_name,
  service.price_pence,
  service.duration_minutes
FROM beauty.last_minute_slots slot
JOIN beauty.public_professionals p ON p.id=slot.professional_id
JOIN beauty.public_services service
  ON service.id=slot.service_id
 AND service.professional_id=slot.professional_id
WHERE slot.status='active'
  AND slot.expires_at>now()
  AND slot.starts_at>now()
  AND NOT EXISTS (
    SELECT 1
    FROM beauty.bookings booking
    WHERE booking.professional_id=slot.professional_id
      AND booking.starts_at < slot.ends_at
      AND booking.ends_at > slot.starts_at
      AND (
        booking.status='confirmed'
        OR (
          booking.status='payment_pending'
          AND booking.hold_expires_at>now()
        )
      )
  );

GRANT SELECT ON beauty.public_last_minute_slots TO beauty_app;

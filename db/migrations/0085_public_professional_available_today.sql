CREATE OR REPLACE FUNCTION beauty.public_professional_available_today(target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  available boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=target
      AND p.publication_status='published'
      AND u.status='active'
  ) THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM beauty.availability_rules ar
    JOIN LATERAL (
      SELECT min(s.duration_minutes)::integer AS duration_minutes
      FROM beauty.services s
      WHERE s.professional_id=target
        AND s.active
    ) svc ON svc.duration_minutes IS NOT NULL
    JOIN LATERAL generate_series(
      ar.start_minute,
      ar.end_minute - svc.duration_minutes,
      15
    ) slot(start_minute) ON true
    CROSS JOIN LATERAL (
      SELECT
        (((now() AT TIME ZONE 'Europe/London')::date
          + make_interval(mins => slot.start_minute))
          AT TIME ZONE 'Europe/London') AS starts_at,
        (((now() AT TIME ZONE 'Europe/London')::date
          + make_interval(mins => slot.start_minute + svc.duration_minutes))
          AT TIME ZONE 'Europe/London') AS ends_at
    ) candidate
    WHERE ar.professional_id=target
      AND ar.weekday=extract(
        dow FROM (now() AT TIME ZONE 'Europe/London')
      )::integer
      AND candidate.starts_at >= now() + interval '1 hour'
      AND NOT EXISTS (
        SELECT 1
        FROM beauty.availability_blocks block
        WHERE block.professional_id=target
          AND block.starts_at < candidate.ends_at
          AND block.ends_at > candidate.starts_at
      )
      AND NOT EXISTS (
        SELECT 1
        FROM beauty.bookings booking
        WHERE booking.professional_id=target
          AND booking.starts_at < candidate.ends_at
          AND booking.ends_at > candidate.starts_at
          AND (
            booking.status='confirmed'
            OR (
              booking.status='payment_pending'
              AND booking.hold_expires_at>now()
            )
          )
      )
  ) INTO available;

  RETURN coalesce(available,false);
END
$$;

GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.public_professional_available_today(uuid)
  OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;

REVOKE ALL ON FUNCTION beauty.public_professional_available_today(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.public_professional_available_today(uuid)
  TO beauty_app;

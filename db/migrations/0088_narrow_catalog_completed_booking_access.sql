-- Public reviews only need to know whether a booking is completed and which
-- professional it belongs to. Do not grant the public catalog raw booking access.

CREATE OR REPLACE FUNCTION beauty.catalog_completed_booking_professional(target_booking_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT b.professional_id
  FROM beauty.bookings b
  WHERE b.id=target_booking_id
    AND b.status='completed'
  LIMIT 1;
$$;

ALTER FUNCTION beauty.catalog_completed_booking_professional(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION beauty.catalog_completed_booking_professional(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.catalog_completed_booking_professional(uuid) TO beauty_catalog;

DROP POLICY IF EXISTS reviews_public ON beauty.reviews;
CREATE POLICY reviews_public
ON beauty.reviews
FOR SELECT TO beauty_catalog
USING (
  moderation_status='visible'
  AND beauty.catalog_completed_booking_professional(booking_id) IS NOT NULL
);

CREATE OR REPLACE VIEW beauty.public_reviews
WITH (security_barrier=true)
AS
SELECT
  r.id,
  beauty.catalog_completed_booking_professional(r.booking_id) AS professional_id,
  r.rating,
  r.body,
  r.public_name,
  r.created_at
FROM beauty.reviews r
WHERE beauty.catalog_completed_booking_professional(r.booking_id) IS NOT NULL;

ALTER VIEW beauty.public_reviews OWNER TO beauty_catalog;
GRANT SELECT ON beauty.public_reviews TO beauty_app;

REVOKE SELECT ON beauty.bookings FROM beauty_catalog;

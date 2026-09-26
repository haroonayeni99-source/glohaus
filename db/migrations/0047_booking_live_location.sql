-- Optional customer journey location for confirmed bookings.
-- This stores only the latest shared position plus consent/session timestamps;
-- it is not a permanent background location trail.

CREATE TABLE beauty.booking_location_sessions (
  booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES beauty.users(id),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  consent_version text NOT NULL DEFAULT 'booking-journey-location-v1',
  sharing boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  expires_at timestamptz NOT NULL,
  last_latitude double precision CHECK(last_latitude BETWEEN -90 AND 90),
  last_longitude double precision CHECK(last_longitude BETWEEN -180 AND 180),
  last_accuracy_m integer CHECK(last_accuracy_m IS NULL OR last_accuracy_m BETWEEN 0 AND 5000),
  last_observed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_location_sessions_professional_idx
ON beauty.booking_location_sessions(professional_id,expires_at DESC);

ALTER TABLE beauty.booking_location_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.booking_location_sessions FORCE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE ON beauty.booking_location_sessions TO beauty_app;

CREATE POLICY booking_location_session_participant_read
ON beauty.booking_location_sessions
FOR SELECT TO beauty_app
USING(
  EXISTS(
    SELECT 1
    FROM beauty.users customer
    WHERE customer.id=customer_id
      AND customer.auth_id=beauty.auth_id()
      AND customer.status='active'
  )
  OR EXISTS(
    SELECT 1
    FROM beauty.professional_profiles professional
    JOIN beauty.users owner_user ON owner_user.id=professional.user_id
    WHERE professional.id=professional_id
      AND owner_user.auth_id=beauty.auth_id()
      AND owner_user.status='active'
  )
);

CREATE POLICY booking_location_session_customer_insert
ON beauty.booking_location_sessions
FOR INSERT TO beauty_app
WITH CHECK(
  EXISTS(
    SELECT 1
    FROM beauty.bookings booking
    JOIN beauty.users customer ON customer.id=booking.customer_id
    WHERE booking.id=booking_id
      AND booking.customer_id=customer_id
      AND booking.professional_id=professional_id
      AND customer.auth_id=beauty.auth_id()
      AND customer.status='active'
      AND booking.status='confirmed'
      AND now() BETWEEN booking.starts_at-interval '3 hours' AND booking.ends_at
      AND expires_at=booking.ends_at
  )
);

CREATE POLICY booking_location_session_customer_update
ON beauty.booking_location_sessions
FOR UPDATE TO beauty_app
USING(
  EXISTS(
    SELECT 1
    FROM beauty.users customer
    WHERE customer.id=customer_id
      AND customer.auth_id=beauty.auth_id()
      AND customer.status='active'
  )
)
WITH CHECK(
  EXISTS(
    SELECT 1
    FROM beauty.bookings booking
    JOIN beauty.users customer ON customer.id=booking.customer_id
    WHERE booking.id=booking_id
      AND booking.customer_id=customer_id
      AND booking.professional_id=professional_id
      AND customer.auth_id=beauty.auth_id()
      AND customer.status='active'
      AND expires_at=booking.ends_at
  )
);

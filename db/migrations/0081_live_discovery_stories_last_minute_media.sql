-- GLOHAUS live discovery: media types, 24-hour stories and last-minute availability.

ALTER TABLE beauty.portfolio_assets
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image','video')),
  ADD COLUMN IF NOT EXISTS mime_type text NOT NULL DEFAULT 'image/webp'
    CHECK (
      mime_type IN (
        'image/webp','image/jpeg','image/png',
        'video/mp4','video/webm','video/quicktime'
      )
    );

CREATE TABLE IF NOT EXISTS beauty.professional_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES beauty.portfolio_assets(id) ON DELETE CASCADE,
  service_id uuid NULL REFERENCES beauty.services(id) ON DELETE SET NULL,
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 240),
  publication_status text NOT NULL DEFAULT 'published'
    CHECK (publication_status IN ('published','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CHECK (expires_at > created_at),
  CHECK (expires_at <= created_at + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS professional_stories_live_idx
  ON beauty.professional_stories (professional_id, expires_at DESC)
  WHERE publication_status='published';

ALTER TABLE beauty.professional_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_stories_owner ON beauty.professional_stories;
CREATE POLICY professional_stories_owner
ON beauty.professional_stories
FOR ALL TO beauty_app
USING (EXISTS (
  SELECT 1 FROM beauty.professional_profiles p
  WHERE p.id = professional_stories.professional_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM beauty.professional_profiles p
  WHERE p.id = professional_stories.professional_id
));

DROP POLICY IF EXISTS professional_stories_public ON beauty.professional_stories;
CREATE POLICY professional_stories_public
ON beauty.professional_stories
FOR SELECT TO beauty_app
USING (publication_status='published' AND expires_at > now());

GRANT SELECT, INSERT, UPDATE, DELETE ON beauty.professional_stories TO beauty_app;

CREATE TABLE IF NOT EXISTS beauty.last_minute_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES beauty.services(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  caption text NOT NULL DEFAULT 'Last-minute appointment available'
    CHECK (char_length(caption) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','booked','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (ends_at > starts_at),
  CHECK (starts_at > created_at),
  CHECK (expires_at > created_at),
  CHECK (expires_at <= starts_at)
);

CREATE INDEX IF NOT EXISTS last_minute_slots_live_idx
  ON beauty.last_minute_slots (starts_at, professional_id)
  WHERE status='active';

ALTER TABLE beauty.last_minute_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS last_minute_slots_owner ON beauty.last_minute_slots;
CREATE POLICY last_minute_slots_owner
ON beauty.last_minute_slots
FOR ALL TO beauty_app
USING (EXISTS (
  SELECT 1 FROM beauty.professional_profiles p
  WHERE p.id = last_minute_slots.professional_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM beauty.professional_profiles p
  WHERE p.id = last_minute_slots.professional_id
));

DROP POLICY IF EXISTS last_minute_slots_public ON beauty.last_minute_slots;
CREATE POLICY last_minute_slots_public
ON beauty.last_minute_slots
FOR SELECT TO beauty_app
USING (
  status='active'
  AND expires_at > now()
  AND starts_at > now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON beauty.last_minute_slots TO beauty_app;

CREATE OR REPLACE VIEW beauty.public_media_assets AS
SELECT id, professional_id, alt_text, media_type, mime_type, created_at
FROM beauty.portfolio_assets
WHERE publication_status='published';

GRANT SELECT ON beauty.public_media_assets TO beauty_app;

CREATE OR REPLACE VIEW beauty.published_media_paths AS
SELECT id, blob_path, media_type, mime_type
FROM beauty.portfolio_assets
WHERE publication_status='published';

GRANT SELECT ON beauty.published_media_paths TO beauty_app;

CREATE OR REPLACE VIEW beauty.public_stories AS
SELECT
  story.id,
  story.professional_id,
  story.asset_id,
  story.service_id,
  story.caption,
  story.created_at,
  story.expires_at,
  p.slug,
  p.business_name,
  p.city,
  p.category,
  asset.media_type,
  asset.mime_type,
  service.name AS service_name,
  service.price_pence
FROM beauty.professional_stories story
JOIN beauty.public_professionals p ON p.id=story.professional_id
JOIN beauty.portfolio_assets asset
  ON asset.id=story.asset_id
 AND asset.professional_id=story.professional_id
LEFT JOIN beauty.services service
  ON service.id=story.service_id
 AND service.professional_id=story.professional_id
WHERE story.publication_status='published'
  AND story.expires_at>now()
  AND asset.publication_status='published';

GRANT SELECT ON beauty.public_stories TO beauty_app;

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
  AND slot.starts_at>now();

GRANT SELECT ON beauty.public_last_minute_slots TO beauty_app;

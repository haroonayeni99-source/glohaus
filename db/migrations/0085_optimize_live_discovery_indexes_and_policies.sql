-- Index foreign keys used by Stories and last-minute availability, and
-- collapse duplicate permissive SELECT policies without changing access rules.

CREATE INDEX IF NOT EXISTS last_minute_slots_professional_idx
  ON beauty.last_minute_slots (professional_id);
CREATE INDEX IF NOT EXISTS last_minute_slots_service_idx
  ON beauty.last_minute_slots (service_id);
CREATE INDEX IF NOT EXISTS professional_stories_asset_idx
  ON beauty.professional_stories (asset_id);
CREATE INDEX IF NOT EXISTS professional_stories_service_idx
  ON beauty.professional_stories (service_id);

DROP POLICY IF EXISTS last_minute_slots_owner ON beauty.last_minute_slots;
DROP POLICY IF EXISTS last_minute_slots_public ON beauty.last_minute_slots;

CREATE POLICY last_minute_slots_read
ON beauty.last_minute_slots
FOR SELECT TO beauty_app
USING (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=last_minute_slots.professional_id
  )
  OR (
    status='active'
    AND expires_at>now()
    AND starts_at>now()
  )
);

CREATE POLICY last_minute_slots_insert
ON beauty.last_minute_slots
FOR INSERT TO beauty_app
WITH CHECK (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=last_minute_slots.professional_id
  )
);

CREATE POLICY last_minute_slots_update
ON beauty.last_minute_slots
FOR UPDATE TO beauty_app
USING (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=last_minute_slots.professional_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=last_minute_slots.professional_id
  )
);

CREATE POLICY last_minute_slots_delete
ON beauty.last_minute_slots
FOR DELETE TO beauty_app
USING (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=last_minute_slots.professional_id
  )
);

DROP POLICY IF EXISTS professional_stories_owner ON beauty.professional_stories;
DROP POLICY IF EXISTS professional_stories_public ON beauty.professional_stories;

CREATE POLICY professional_stories_read
ON beauty.professional_stories
FOR SELECT TO beauty_app
USING (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=professional_stories.professional_id
  )
  OR (
    publication_status='published'
    AND expires_at>now()
  )
);

CREATE POLICY professional_stories_insert
ON beauty.professional_stories
FOR INSERT TO beauty_app
WITH CHECK (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=professional_stories.professional_id
  )
);

CREATE POLICY professional_stories_update
ON beauty.professional_stories
FOR UPDATE TO beauty_app
USING (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=professional_stories.professional_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=professional_stories.professional_id
  )
);

CREATE POLICY professional_stories_delete
ON beauty.professional_stories
FOR DELETE TO beauty_app
USING (
  EXISTS (
    SELECT 1 FROM beauty.professional_profiles p
    WHERE p.id=professional_stories.professional_id
  )
);

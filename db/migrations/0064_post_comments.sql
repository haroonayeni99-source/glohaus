-- Public comments for published professional posts.
-- This migration is intentionally staged on a development branch and is not applied to production.

CREATE TABLE beauty.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES beauty.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES beauty.users(id) ON DELETE CASCADE,
  author_name text NOT NULL CHECK(length(trim(author_name)) BETWEEN 1 AND 120),
  body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 500),
  moderation_status text NOT NULL DEFAULT 'visible'
    CHECK(moderation_status IN ('visible','hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX post_comments_post_recent
  ON beauty.post_comments(post_id,created_at DESC,id DESC);
CREATE INDEX post_comments_user_rate
  ON beauty.post_comments(user_id,created_at DESC);

ALTER TABLE beauty.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.post_comments FORCE ROW LEVEL SECURITY;

CREATE POLICY post_comment_public_read ON beauty.post_comments
FOR SELECT TO beauty_app
USING (
  moderation_status='visible'
  AND EXISTS(
    SELECT 1
    FROM beauty.posts p
    WHERE p.id=post_id
      AND p.publication_status='published'
      AND p.moderation_status='visible'
  )
);

CREATE POLICY post_comment_owner_insert ON beauty.post_comments
FOR INSERT TO beauty_app
WITH CHECK (
  EXISTS(
    SELECT 1
    FROM beauty.users u
    WHERE u.id=user_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
  AND EXISTS(
    SELECT 1
    FROM beauty.posts p
    WHERE p.id=post_id
      AND p.publication_status='published'
      AND p.moderation_status='visible'
  )
);

CREATE POLICY post_comment_owner_delete ON beauty.post_comments
FOR DELETE TO beauty_app
USING (
  EXISTS(
    SELECT 1
    FROM beauty.users u
    WHERE u.id=user_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

GRANT SELECT,DELETE ON beauty.post_comments TO beauty_app;
GRANT INSERT(post_id,user_id,author_name,body) ON beauty.post_comments TO beauty_app;

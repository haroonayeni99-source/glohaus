-- Private viewer preferences, never exposed through catalogue views.
CREATE TABLE beauty.post_engagement (
 user_id uuid NOT NULL REFERENCES beauty.users(id),
 post_id uuid NOT NULL REFERENCES beauty.posts(id),
 liked boolean NOT NULL DEFAULT false,
 saved boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,post_id)
);
ALTER TABLE beauty.post_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.post_engagement FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_owner ON beauty.post_engagement FOR ALL TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=user_id AND u.auth_id=beauty.auth_id() AND u.status='active'))
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=user_id AND u.auth_id=beauty.auth_id() AND u.status='active'));
GRANT SELECT,DELETE ON beauty.post_engagement TO beauty_app;
GRANT INSERT(user_id,post_id,liked,saved),UPDATE(liked,saved) ON beauty.post_engagement TO beauty_app;
CREATE INDEX engagement_saved ON beauty.post_engagement(user_id,created_at DESC,post_id DESC) WHERE saved;

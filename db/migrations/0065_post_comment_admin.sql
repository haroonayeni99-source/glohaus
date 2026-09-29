-- Admin moderation for feed comments. Development branch only.

GRANT SELECT,UPDATE(moderation_status) ON beauty.post_comments TO beauty_admin_ops;

CREATE POLICY post_comments_admin_read ON beauty.post_comments
FOR SELECT TO beauty_admin_ops USING(true);

CREATE POLICY post_comments_admin_update ON beauty.post_comments
FOR UPDATE TO beauty_admin_ops
USING(true)
WITH CHECK(true);

CREATE FUNCTION beauty.admin_comment_overview() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  PERFORM beauty.require_admin();
  RETURN jsonb_build_object(
    'comments',
    (
      SELECT coalesce(jsonb_agg(row_data),'[]'::jsonb)
      FROM (
        SELECT
          c.id,
          c.post_id,
          c.user_id,
          c.author_name,
          c.body,
          c.moderation_status,
          c.created_at,
          p.title AS post_title
        FROM beauty.post_comments c
        JOIN beauty.posts p ON p.id=c.post_id
        ORDER BY c.created_at DESC,c.id DESC
        LIMIT 100
      ) row_data
    )
  );
END $$;

CREATE FUNCTION beauty.admin_moderate_comment(
  target uuid,
  next_status text,
  decision_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor uuid;
  target_user uuid;
  target_post uuid;
BEGIN
  actor:=beauty.require_admin();

  IF next_status NOT IN ('visible','hidden')
     OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT user_id,post_id INTO target_user,target_post
  FROM beauty.post_comments
  WHERE id=target
  FOR UPDATE;

  IF target_user IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.post_comments
  SET moderation_status=next_status
  WHERE id=target;

  PERFORM beauty.write_admin_audit(
    actor,
    'admin',
    'comment.'||next_status,
    target_user,
    'post_comment',
    target,
    decision_reason,
    jsonb_build_object('postId',target_post)
  );
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_comment_overview() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_moderate_comment(uuid,text,text) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;

REVOKE ALL ON FUNCTION
  beauty.admin_comment_overview(),
  beauty.admin_moderate_comment(uuid,text,text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  beauty.admin_comment_overview(),
  beauty.admin_moderate_comment(uuid,text,text)
TO beauty_app;

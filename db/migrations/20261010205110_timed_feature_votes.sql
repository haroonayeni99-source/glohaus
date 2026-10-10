-- Timed anonymous Like/Dislike voting. Preserve existing votes as Likes.
-- Unselecting retains the row with a NULL choice; no vote or request is deleted.
ALTER TABLE beauty.feature_requests ADD COLUMN closes_at timestamptz;
UPDATE beauty.feature_requests SET closes_at=created_at + interval '7 days' WHERE closes_at IS NULL;
ALTER TABLE beauty.feature_requests ALTER COLUMN closes_at SET DEFAULT (now() + interval '7 days');
ALTER TABLE beauty.feature_requests ALTER COLUMN closes_at SET NOT NULL;
ALTER TABLE beauty.feature_votes ADD COLUMN choice text DEFAULT 'like';
ALTER TABLE beauty.feature_votes ADD CONSTRAINT feature_votes_choice_check CHECK (choice IN ('like','dislike'));

CREATE FUNCTION beauty.feature_vote_results()
RETURNS TABLE(id uuid, audience text, title text, description text, status text,
  vote_count integer, my_vote boolean, dislike_count integer, total_count integer,
  my_choice text, closes_at timestamptz, voting_open boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid;
BEGIN
  SELECT u.id INTO uid FROM beauty.users u WHERE u.auth_id=beauty.auth_id();
  IF uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  RETURN QUERY
  SELECT f.id,f.audience,f.title,f.description,f.status,
    count(*) FILTER (WHERE v.choice='like')::integer,
    coalesce(bool_or(v.user_id=uid AND v.choice='like'),false),
    count(*) FILTER (WHERE v.choice='dislike')::integer,
    count(v.choice)::integer,
    max(v.choice) FILTER (WHERE v.user_id=uid),f.closes_at,
    f.closes_at>clock_timestamp() AND f.status<>'closed'
  FROM beauty.feature_requests f LEFT JOIN beauty.feature_votes v ON v.feature_id=f.id
  WHERE f.active
  GROUP BY f.id
  ORDER BY (f.closes_at>clock_timestamp() AND f.status<>'closed') DESC,
    count(*) FILTER (WHERE v.choice='like') DESC,f.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION beauty.feature_vote_results() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.feature_vote_results() TO beauty_app;

CREATE FUNCTION beauty.set_feature_vote(target_feature uuid, target_choice text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid; deadline timestamptz; feature_status text; result jsonb;
BEGIN
  SELECT u.id INTO uid FROM beauty.users u WHERE u.auth_id=beauty.auth_id();
  IF uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF target_choice IS NULL OR target_choice NOT IN ('like','dislike','none') THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  -- Serialize changes per idea so each response contains its committed choice and totals.
  SELECT f.closes_at,f.status INTO deadline,feature_status FROM beauty.feature_requests f
    WHERE f.id=target_feature AND f.active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF deadline<=clock_timestamp() OR feature_status='closed' THEN
    RAISE EXCEPTION 'VOTING_CLOSED' USING ERRCODE='P0001';
  END IF;
  INSERT INTO beauty.feature_votes(feature_id,user_id,choice)
    VALUES(target_feature,uid,nullif(target_choice,'none'))
    ON CONFLICT(feature_id,user_id) DO UPDATE SET choice=EXCLUDED.choice;
  SELECT to_jsonb(r) INTO result FROM beauty.feature_vote_results() r WHERE r.id=target_feature;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION beauty.set_feature_vote(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.set_feature_vote(uuid,text) TO beauty_app;

-- Keep the previous release usable during rollout; only Likes count as old-style votes.
CREATE OR REPLACE FUNCTION beauty.public_feature_requests()
RETURNS TABLE(id uuid,audience text,title text,description text,status text,vote_count integer,my_vote boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  RETURN QUERY SELECT r.id,r.audience,r.title,r.description,r.status,r.vote_count,r.my_vote
    FROM beauty.feature_vote_results() r;
END;
$$;
CREATE OR REPLACE FUNCTION beauty.toggle_feature_vote(target_feature uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid; old_choice text; result jsonb;
BEGIN
  SELECT u.id INTO uid FROM beauty.users u WHERE u.auth_id=beauty.auth_id();
  IF uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  PERFORM 1 FROM beauty.feature_requests f WHERE f.id=target_feature AND f.active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT v.choice INTO old_choice FROM beauty.feature_votes v WHERE v.feature_id=target_feature AND v.user_id=uid;
  result:=beauty.set_feature_vote(target_feature,CASE WHEN old_choice='like' THEN 'none' ELSE 'like' END);
  RETURN (result->>'my_vote')::boolean;
END;
$$;

CREATE FUNCTION beauty.owner_create_feature_request(target_audience text,target_title text,target_description text,duration_days integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; new_id uuid;
BEGIN
  PERFORM beauty.require_owner();
  IF target_audience IS NULL OR target_audience NOT IN('customer','professional','all')
    OR duration_days IS NULL OR duration_days NOT BETWEEN 1 AND 90 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  SELECT u.id INTO actor FROM beauty.users u WHERE u.auth_id=beauty.auth_id();
  INSERT INTO beauty.feature_requests(audience,title,description,created_by,closes_at)
    VALUES(target_audience,trim(target_title),trim(target_description),actor,now()+make_interval(days=>duration_days))
    RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION beauty.owner_create_feature_request(text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_create_feature_request(text,text,text,integer) TO beauty_app;
CREATE OR REPLACE FUNCTION beauty.owner_create_feature_request(target_audience text,target_title text,target_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  RETURN beauty.owner_create_feature_request(target_audience,target_title,target_description,7);
END;
$$;
-- Replacements retain the production execute boundary; also enforce it on fresh installs.
REVOKE ALL ON FUNCTION beauty.public_feature_requests(),beauty.toggle_feature_vote(uuid),beauty.owner_create_feature_request(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.public_feature_requests(),beauty.toggle_feature_vote(uuid),beauty.owner_create_feature_request(text,text,text) TO beauty_app;

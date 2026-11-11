-- Additive, Instagram-only lifecycle boundary. No financial/account rows change.
CREATE ROLE beauty_instagram_lifecycle NOLOGIN NOSUPERUSER NOBYPASSRLS;
-- Hosted Postgres installers require temporary membership to assign ownership.
GRANT beauty_instagram_lifecycle TO CURRENT_USER;
GRANT USAGE ON SCHEMA beauty TO beauty_instagram_lifecycle;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_instagram_lifecycle;
GRANT SELECT(id,auth_id) ON beauty.users TO beauty_instagram_lifecycle;
GRANT SELECT(id,user_id) ON beauty.professional_profiles TO beauty_instagram_lifecycle;
CREATE POLICY instagram_identity_lookup ON beauty.users FOR SELECT TO beauty_instagram_lifecycle USING(true);
CREATE POLICY instagram_profile_lookup ON beauty.professional_profiles FOR SELECT TO beauty_instagram_lifecycle USING(true);
GRANT SELECT(id,professional_id,provider),UPDATE(status,secret_ciphertext,auto_publish,sync_enabled,social_mode,lease_until,last_error) ON beauty.business_connections TO beauty_instagram_lifecycle;
CREATE POLICY instagram_connections_select ON beauty.business_connections FOR SELECT TO beauty_instagram_lifecycle USING(provider='instagram');
CREATE POLICY instagram_connections_update ON beauty.business_connections FOR UPDATE TO beauty_instagram_lifecycle USING(provider='instagram') WITH CHECK(provider='instagram');
GRANT SELECT(id,connection_id,platform),DELETE ON beauty.social_portfolio TO beauty_instagram_lifecycle;
CREATE POLICY instagram_posts_select ON beauty.social_portfolio FOR SELECT TO beauty_instagram_lifecycle USING(platform='instagram');
CREATE POLICY instagram_posts_delete ON beauty.social_portfolio FOR DELETE TO beauty_instagram_lifecycle USING(platform='instagram');

-- Raw provider IDs remain encrypted in the existing credential envelope.
CREATE TABLE beauty.instagram_connection_subjects (
 connection_id uuid NOT NULL REFERENCES beauty.business_connections(id) ON DELETE CASCADE,
 app_id text NOT NULL CHECK(app_id ~ '^[0-9]{1,128}$'),
 subject_key text NOT NULL CHECK(subject_key ~ '^[a-f0-9]{64}$'),
 authorized_at timestamptz NOT NULL, PRIMARY KEY(connection_id,subject_key)
);
CREATE INDEX instagram_connection_subject_lookup ON beauty.instagram_connection_subjects(subject_key);
-- Short-lived keyed tombstones stop an OAuth flow started before revocation
-- from restoring credentials afterwards. They are not part of the audit trail.
CREATE TABLE beauty.instagram_revocations (
 subject_key text PRIMARY KEY CHECK(subject_key ~ '^[a-f0-9]{64}$'),
 revoked_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
);
-- The audit/status receipt contains no account, connection, provider ID or token.
CREATE TABLE beauty.instagram_callback_receipts (
 confirmation_code text NOT NULL CHECK(confirmation_code ~ '^[a-f0-9]{64}$'),
 operation text NOT NULL CHECK(operation IN('deauthorize','delete')),
 completed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(confirmation_code,operation)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['instagram_connection_subjects','instagram_revocations','instagram_callback_receipts'] LOOP
  EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.%I TO beauty_instagram_lifecycle',t);
  EXECUTE format('CREATE POLICY instagram_lifecycle_private ON beauty.%I TO beauty_instagram_lifecycle USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;

CREATE FUNCTION beauty.prune_instagram_lifecycle() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 DELETE FROM beauty.instagram_revocations WHERE expires_at<now();
 DELETE FROM beauty.instagram_callback_receipts WHERE completed_at<now()-interval '30 days';
END $$;

CREATE FUNCTION beauty.bind_instagram_connection(target uuid,app text,subjects text[],authorization_started timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('glohaus-social-sync',0));
 IF app !~ '^[0-9]{1,128}$' OR subjects IS NULL OR cardinality(subjects) NOT BETWEEN 1 AND 3 OR EXISTS(SELECT 1 FROM unnest(subjects) s WHERE s IS NULL OR s !~ '^[a-f0-9]{64}$') OR authorization_started IS NULL
  OR authorization_started<now()-interval '15 minutes' OR authorization_started>now()+interval '5 minutes'
  OR NOT EXISTS(SELECT 1 FROM beauty.business_connections c JOIN beauty.professional_profiles p ON p.id=c.professional_id
   JOIN beauty.users u ON u.id=p.user_id WHERE c.id=target AND c.provider='instagram' AND u.auth_id=beauty.auth_id())
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM beauty.instagram_revocations WHERE subject_key=ANY(subjects) AND expires_at>now() AND revoked_at>=authorization_started)
 THEN RAISE EXCEPTION 'RECONNECT_REQUIRED' USING ERRCODE='22023'; END IF;
 DELETE FROM beauty.instagram_connection_subjects WHERE connection_id=target;
 INSERT INTO beauty.instagram_connection_subjects(connection_id,app_id,subject_key,authorized_at)
 SELECT target,app,s,authorization_started FROM (SELECT DISTINCT unnest(subjects) AS s) keys;
 UPDATE beauty.business_connections SET auto_publish=false,social_mode='approval' WHERE id=target AND provider='instagram';
END $$;

CREATE FUNCTION beauty.instagram_lifecycle_callback(subject text,issued_at bigint,action text,receipt text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cutoff timestamptz:=to_timestamp(issued_at)+interval '1 second'; targets uuid[]; BEGIN
 IF subject !~ '^[a-f0-9]{64}$' OR receipt !~ '^[a-f0-9]{64}$' OR action NOT IN('deauthorize','delete')
  OR issued_at IS NULL OR issued_at<=0 OR to_timestamp(issued_at)>now()+interval '5 minutes'
 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('glohaus-social-sync',0));
 -- A replay is acknowledged without touching a subsequently reconnected account.
 IF EXISTS(SELECT 1 FROM beauty.instagram_callback_receipts WHERE confirmation_code=receipt AND operation=action) THEN RETURN; END IF;
 PERFORM beauty.prune_instagram_lifecycle();
 INSERT INTO beauty.instagram_revocations(subject_key,revoked_at,expires_at)
 VALUES(subject,cutoff,now()+interval '1 day')
 ON CONFLICT(subject_key) DO UPDATE SET revoked_at=greatest(beauty.instagram_revocations.revoked_at,EXCLUDED.revoked_at),expires_at=EXCLUDED.expires_at;
 SELECT coalesce(array_agg(connection_id),'{}'::uuid[]) INTO targets FROM beauty.instagram_connection_subjects
 WHERE subject_key=subject AND authorized_at<=cutoff;
 UPDATE beauty.business_connections SET status='disconnected',secret_ciphertext='',auto_publish=false,sync_enabled=false,
  social_mode='manual',lease_until=NULL,last_error=NULL WHERE id=ANY(targets) AND provider='instagram';
 IF action='delete' THEN
  DELETE FROM beauty.social_portfolio WHERE connection_id=ANY(targets) AND platform='instagram';
  DELETE FROM beauty.instagram_connection_subjects WHERE connection_id=ANY(targets);
 END IF;
 INSERT INTO beauty.instagram_callback_receipts(confirmation_code,operation) VALUES(receipt,action);
END $$;

CREATE FUNCTION beauty.instagram_deletion_completed(receipt text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM beauty.instagram_callback_receipts WHERE confirmation_code=receipt AND operation='delete' AND completed_at>now()-interval '30 days')
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_instagram_lifecycle;
ALTER FUNCTION beauty.prune_instagram_lifecycle() OWNER TO beauty_instagram_lifecycle;
ALTER FUNCTION beauty.bind_instagram_connection(uuid,text,text[],timestamptz) OWNER TO beauty_instagram_lifecycle;
ALTER FUNCTION beauty.instagram_lifecycle_callback(text,bigint,text,text) OWNER TO beauty_instagram_lifecycle;
ALTER FUNCTION beauty.instagram_deletion_completed(text) OWNER TO beauty_instagram_lifecycle;
REVOKE CREATE ON SCHEMA beauty FROM beauty_instagram_lifecycle;
REVOKE ALL ON FUNCTION beauty.prune_instagram_lifecycle(),beauty.bind_instagram_connection(uuid,text,text[],timestamptz),beauty.instagram_lifecycle_callback(text,bigint,text,text),beauty.instagram_deletion_completed(text) FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.bind_instagram_connection(uuid,text,text[],timestamptz) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.prune_instagram_lifecycle(),beauty.instagram_lifecycle_callback(text,bigint,text,text),beauty.instagram_deletion_completed(text) TO beauty_payment_worker;
REVOKE beauty_instagram_lifecycle FROM CURRENT_USER;

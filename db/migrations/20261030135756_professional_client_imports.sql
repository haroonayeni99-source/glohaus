-- Private, bounded existing-client import. No account creation or messaging.
CREATE TABLE beauty.client_import_secret(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),salt text NOT NULL DEFAULT gen_random_uuid()::text);
INSERT INTO beauty.client_import_secret DEFAULT VALUES;
CREATE TABLE beauty.professional_client_import_batches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 payload_hash text NOT NULL,actor_user_id uuid NOT NULL REFERENCES beauty.users(id),imported integer NOT NULL,skipped integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(professional_id,payload_hash)
);
CREATE TABLE beauty.professional_imported_contacts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 email_key text NOT NULL,name text,email text,phone text,permission_date date,permission_source text,
 batch_id uuid NOT NULL REFERENCES beauty.professional_client_import_batches(id),created_at timestamptz NOT NULL DEFAULT now(),removed_at timestamptz,
 UNIQUE(professional_id,email_key),CHECK((removed_at IS NOT NULL AND name IS NULL AND email IS NULL AND phone IS NULL AND permission_date IS NULL AND permission_source IS NULL) OR
 (removed_at IS NULL AND length(name) BETWEEN 1 AND 100 AND length(email) BETWEEN 3 AND 254 AND permission_date IS NOT NULL AND length(permission_source) BETWEEN 5 AND 300))
);
CREATE TABLE beauty.professional_client_import_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 actor_user_id uuid NOT NULL REFERENCES beauty.users(id),action text NOT NULL CHECK(action IN('import','remove')),
 batch_id uuid REFERENCES beauty.professional_client_import_batches(id),contact_id uuid REFERENCES beauty.professional_imported_contacts(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['client_import_secret','professional_client_import_batches','professional_imported_contacts','professional_client_import_audit'] LOOP
 EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON beauty.%I TO beauty_admin_ops',t);
 EXECUTE format('CREATE POLICY import_ops ON beauty.%I TO beauty_admin_ops USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
GRANT USAGE,SELECT ON SEQUENCE beauty.professional_client_import_audit_id_seq TO beauty_admin_ops;
GRANT SELECT ON beauty.professional_imported_contacts,beauty.professional_client_import_batches TO beauty_app;
CREATE POLICY imported_contacts_owner ON beauty.professional_imported_contacts FOR SELECT TO beauty_app USING(EXISTS(
 SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=professional_id AND u.auth_id=beauty.auth_id()
 AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())
));
CREATE POLICY imported_batches_owner ON beauty.professional_client_import_batches FOR SELECT TO beauty_app USING(EXISTS(
 SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=professional_id AND u.auth_id=beauty.auth_id()
 AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())
));
CREATE FUNCTION beauty.client_import_actor() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; BEGIN
 SELECT u.id INTO actor FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='professional'
 JOIN beauty.professional_profiles p ON p.user_id=u.id WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL
 AND (u.restricted_until IS NULL OR u.restricted_until<=now());
 IF actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;RETURN actor;
END $$;
CREATE FUNCTION beauty.import_professional_clients(payload jsonb,confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; pro uuid; item jsonb; normalized_email text; fingerprint text; secret text; digest text; batch uuid;
 existing beauty.professional_client_import_batches; added integer:=0; skipped_count integer:=0; active_count integer;
BEGIN
 actor:=beauty.client_import_actor();SELECT id INTO pro FROM beauty.professional_profiles WHERE user_id=actor;
 IF confirmed IS DISTINCT FROM true OR jsonb_typeof(payload) IS DISTINCT FROM 'array' OR jsonb_array_length(payload) NOT BETWEEN 1 AND 500 OR octet_length(payload::text)>524288 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('professional-client-import:'||pro::text,0));
 SELECT salt INTO secret FROM beauty.client_import_secret WHERE singleton;
 digest:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 SELECT * INTO existing FROM beauty.professional_client_import_batches WHERE professional_id=pro AND payload_hash=digest;
 IF existing.id IS NOT NULL THEN RETURN jsonb_build_object('batchId',existing.id,'imported',0,'skipped',jsonb_array_length(payload),'replayed',true);END IF;
 IF (SELECT count(DISTINCT lower(trim(value->>'email'))) FROM jsonb_array_elements(payload))<>jsonb_array_length(payload) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
 INSERT INTO beauty.professional_client_import_batches(professional_id,payload_hash,actor_user_id,imported,skipped) VALUES(pro,digest,actor,0,0) RETURNING id INTO batch;
 SELECT count(*) INTO active_count FROM beauty.professional_imported_contacts WHERE professional_id=pro AND removed_at IS NULL;
 FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
  normalized_email:=lower(trim(item->>'email'));
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['name','email','phone','import_permission','permission_date','permission_source']<>'{}'::jsonb
   OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'email') IS DISTINCT FROM 'string'
   OR jsonb_typeof(item->'permission_date') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'permission_source') IS DISTINCT FROM 'string'
   OR (item ? 'phone' AND jsonb_typeof(item->'phone') IS DISTINCT FROM 'string')
   OR (item->>'name') ~ '[[:cntrl:]]' OR (item->>'permission_source') ~ '[[:cntrl:]]'
   OR item->'import_permission' IS DISTINCT FROM 'true'::jsonb OR length(coalesce(trim(item->>'name'),'')) NOT BETWEEN 1 AND 100
   OR length(coalesce(normalized_email,'')) NOT BETWEEN 3 AND 254 OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
   OR coalesce(item->>'phone','') !~ '^([+]?[0-9 ()-]{7,30})?$'
   OR coalesce(item->>'permission_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR (item->>'permission_date')::date>(now() AT TIME ZONE 'Europe/London')::date
   OR length(coalesce(trim(item->>'permission_source'),'')) NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  fingerprint:=encode(sha256(convert_to(secret||':'||normalized_email,'UTF8')),'hex');
  IF EXISTS(SELECT 1 FROM beauty.professional_imported_contacts WHERE professional_id=pro AND email_key=fingerprint) THEN skipped_count:=skipped_count+1;CONTINUE;END IF;
  IF active_count+added>=500 THEN RAISE EXCEPTION 'IMPORT_LIMIT_REACHED' USING ERRCODE='22023';END IF;
  INSERT INTO beauty.professional_imported_contacts(professional_id,email_key,name,email,phone,permission_date,permission_source,batch_id)
  VALUES(pro,fingerprint,trim(item->>'name'),normalized_email,nullif(trim(item->>'phone'),''),(item->>'permission_date')::date,trim(item->>'permission_source'),batch);
  added:=added+1;
 END LOOP;
 UPDATE beauty.professional_client_import_batches SET imported=added,skipped=skipped_count WHERE id=batch;
 INSERT INTO beauty.professional_client_import_audit(professional_id,actor_user_id,action,batch_id) VALUES(pro,actor,'import',batch);
 RETURN jsonb_build_object('batchId',batch,'imported',added,'skipped',skipped_count,'replayed',false);
END $$;
CREATE FUNCTION beauty.remove_imported_client(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;pro uuid; BEGIN
 actor:=beauty.client_import_actor();SELECT id INTO pro FROM beauty.professional_profiles WHERE user_id=actor;
 PERFORM pg_advisory_xact_lock(hashtextextended('professional-client-import:'||pro::text,0));
 UPDATE beauty.professional_imported_contacts SET name=NULL,email=NULL,phone=NULL,permission_date=NULL,permission_source=NULL,removed_at=now()
 WHERE id=target AND professional_id=pro AND removed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';END IF;
 INSERT INTO beauty.professional_client_import_audit(professional_id,actor_user_id,action,contact_id) VALUES(pro,actor,'remove',target);
END $$;
CREATE FUNCTION beauty.guard_client_import_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Import audit is permanent' USING ERRCODE='42501';END $$;
CREATE TRIGGER client_import_audit_no_change BEFORE UPDATE OR DELETE ON beauty.professional_client_import_audit FOR EACH ROW EXECUTE FUNCTION beauty.guard_client_import_audit();
CREATE TRIGGER client_import_audit_no_truncate BEFORE TRUNCATE ON beauty.professional_client_import_audit FOR EACH STATEMENT EXECUTE FUNCTION beauty.guard_client_import_audit();
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.client_import_actor() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.import_professional_clients(jsonb,boolean) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.remove_imported_client(uuid) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.client_import_actor(),beauty.import_professional_clients(jsonb,boolean),beauty.remove_imported_client(uuid),beauty.guard_client_import_audit() FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.import_professional_clients(jsonb,boolean),beauty.remove_imported_client(uuid) TO beauty_app;

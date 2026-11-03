-- Owner-managed academy pilot. Existing accounts only; no messaging or rewards.
CREATE TABLE beauty.academy_cohorts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),academy_name text NOT NULL CHECK(length(academy_name) BETWEEN 2 AND 120),
 cohort_name text NOT NULL CHECK(length(cohort_name) BETWEEN 2 AND 120),state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','active','closed')),
 created_by uuid NOT NULL REFERENCES beauty.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(academy_name,cohort_name)
);
CREATE TABLE beauty.academy_cohort_members(
 cohort_id uuid NOT NULL REFERENCES beauty.academy_cohorts(id),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 permission_evidence text NOT NULL CHECK(length(permission_evidence) BETWEEN 5 AND 300),joined_at timestamptz NOT NULL DEFAULT now(),
 added_by uuid NOT NULL REFERENCES beauty.users(id),PRIMARY KEY(cohort_id,professional_id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['academy_cohorts','academy_cohort_members'] LOOP
 EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON beauty.%I TO beauty_admin_ops',t);
 EXECUTE format('CREATE POLICY academy_ops ON beauty.%I TO beauty_admin_ops USING(true) WITH CHECK(true)',t);
 END LOOP;END $$;
GRANT DELETE ON beauty.academy_cohort_members TO beauty_admin_ops;
-- The existing internal Owner role can inspect hours only for enrolled cohort professionals.
GRANT SELECT ON beauty.availability_rules TO beauty_admin_ops;
CREATE POLICY academy_owner_hours ON beauty.availability_rules FOR SELECT TO beauty_admin_ops USING(EXISTS(SELECT 1 FROM beauty.academy_cohort_members m WHERE m.professional_id=availability_rules.professional_id));
CREATE FUNCTION beauty.owner_academy_action(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; target uuid; pro uuid; action text; reason text; BEGIN
 actor:=beauty.require_owner();action:=payload->>'action';reason:=trim(payload->>'reason');
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR length(coalesce(reason,'')) NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
 IF action='create' THEN
  IF payload-ARRAY['action','academy','cohort','reason']<>'{}'::jsonb OR length(coalesce(trim(payload->>'academy'),'')) NOT BETWEEN 2 AND 120 OR length(coalesce(trim(payload->>'cohort'),'')) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  INSERT INTO beauty.academy_cohorts(academy_name,cohort_name,created_by) VALUES(trim(payload->>'academy'),trim(payload->>'cohort'),actor) RETURNING id INTO target;
 ELSIF action='state' THEN
  IF payload-ARRAY['action','id','state','reason']<>'{}'::jsonb OR coalesce(payload->>'state','') NOT IN('draft','active','closed') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  target:=(payload->>'id')::uuid;UPDATE beauty.academy_cohorts SET state=payload->>'state' WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';END IF;
 ELSIF action='add' THEN
  IF payload-ARRAY['action','id','professionalId','permissionEvidence','reason']<>'{}'::jsonb OR length(coalesce(trim(payload->>'permissionEvidence'),'')) NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  target:=(payload->>'id')::uuid;pro:=(payload->>'professionalId')::uuid;
  PERFORM 1 FROM beauty.academy_cohorts WHERE id=target AND state='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=pro AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  INSERT INTO beauty.academy_cohort_members(cohort_id,professional_id,permission_evidence,added_by) VALUES(target,pro,trim(payload->>'permissionEvidence'),actor) ON CONFLICT DO NOTHING;
 ELSIF action='remove' THEN
  IF payload-ARRAY['action','id','professionalId','reason']<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
  target:=(payload->>'id')::uuid;pro:=(payload->>'professionalId')::uuid;DELETE FROM beauty.academy_cohort_members WHERE cohort_id=target AND professional_id=pro;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023';END IF;
 ELSE RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';END IF;
 PERFORM beauty.write_admin_audit(actor,'owner','academy_'||action,actor,'academy_cohort',target,reason,jsonb_build_object('cohortId',target,'professionalId',pro,'state',payload->>'state'));
 RETURN target;
END $$;
CREATE FUNCTION beauty.owner_academy_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM beauty.require_owner();RETURN jsonb_build_object('cohorts',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) FROM beauty.academy_cohorts c),'[]'::jsonb),
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('cohortId',m.cohort_id,'professionalId',m.professional_id,'businessName',p.business_name,'joinedAt',m.joined_at,'published',p.publication_status='published',
 'services',EXISTS(SELECT 1 FROM beauty.services s WHERE s.professional_id=p.id AND s.active),
 'availability',EXISTS(SELECT 1 FROM beauty.availability_rules a WHERE a.professional_id=p.id),
 'completedPaidBookings',(SELECT count(*) FROM beauty.bookings b JOIN beauty.payments pay ON pay.booking_id=b.id WHERE b.professional_id=p.id AND b.status='completed' AND b.completed_at<=now() AND pay.captured_pence>pay.refunded_pence AND NOT EXISTS(SELECT 1 FROM beauty.booking_disputes d WHERE d.booking_id=b.id))) ORDER BY m.joined_at DESC) FROM beauty.academy_cohort_members m JOIN beauty.professional_profiles p ON p.id=m.professional_id),'[]'::jsonb));END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_academy_action(jsonb) OWNER TO beauty_admin_ops;ALTER FUNCTION beauty.owner_academy_overview() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.owner_academy_action(jsonb),beauty.owner_academy_overview() FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.owner_academy_action(jsonb),beauty.owner_academy_overview() TO beauty_app;

-- Additive controls. No changes to live pricing, payments, balances or entitlements.
CREATE TABLE beauty.founding_programme (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 state text NOT NULL DEFAULT 'open' CHECK(state IN('open','closed','retired')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 retired_at timestamptz
);
INSERT INTO beauty.founding_programme(id) VALUES(true);
ALTER TABLE beauty.founding_programme ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.founding_programme FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.founding_programme FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,UPDATE ON beauty.founding_programme TO beauty_admin_ops;
CREATE POLICY founding_owner_ops ON beauty.founding_programme TO beauty_admin_ops USING(true) WITH CHECK(true);
CREATE FUNCTION beauty.guard_founding_programme() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.state='retired' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'PROGRAMME_RETIRED' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER founding_retirement_is_final BEFORE UPDATE ON beauty.founding_programme FOR EACH ROW EXECUTE FUNCTION beauty.guard_founding_programme();
CREATE FUNCTION beauty.guard_founding_enrolment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_state text;
BEGIN
 IF NEW.kind='founding_trial' THEN
  SELECT state INTO current_state FROM beauty.founding_programme WHERE id FOR SHARE;
  IF current_state IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'FOUNDING_ENROLMENT_CLOSED' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER founding_enrolment_gate BEFORE INSERT ON beauty.commission_rules FOR EACH ROW EXECUTE FUNCTION beauty.guard_founding_enrolment();

CREATE TABLE beauty.acquisition_pricing_draft (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 professional_basis_points integer NOT NULL DEFAULT 200 CHECK(professional_basis_points BETWEEN 0 AND 5000),
 platform_first_basis_points integer NOT NULL DEFAULT 800 CHECK(platform_first_basis_points BETWEEN 0 AND 5000),
 returning_basis_points integer NOT NULL DEFAULT 200 CHECK(returning_basis_points BETWEEN 0 AND 5000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO beauty.acquisition_pricing_draft(id) VALUES(true);
ALTER TABLE beauty.acquisition_pricing_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.acquisition_pricing_draft FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.acquisition_pricing_draft FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,UPDATE ON beauty.acquisition_pricing_draft TO beauty_admin_ops;
CREATE POLICY acquisition_draft_owner_ops ON beauty.acquisition_pricing_draft TO beauty_admin_ops USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.owner_programme_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM beauty.require_owner();
 RETURN jsonb_build_object('programme',(SELECT to_jsonb(p) FROM beauty.founding_programme p WHERE id),
 'pricingDraft',(SELECT to_jsonb(p) FROM beauty.acquisition_pricing_draft p WHERE id));
END $$;
CREATE FUNCTION beauty.owner_programme_action(payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; prior jsonb; next_value jsonb; current_state text; action text:=payload->>'action'; reason text:=trim(payload->>'reason');
BEGIN
 actor:=beauty.require_owner();
 IF payload->>'confirmed' IS DISTINCT FROM 'true' OR length(coalesce(reason,'')) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'CONFIRMATION_REQUIRED' USING ERRCODE='22023'; END IF;
 IF action='pricing_draft' THEN
  SELECT to_jsonb(d) INTO prior FROM beauty.acquisition_pricing_draft d WHERE id FOR UPDATE;
  UPDATE beauty.acquisition_pricing_draft SET professional_basis_points=(payload->>'professionalBasisPoints')::integer,
  platform_first_basis_points=(payload->>'platformFirstBasisPoints')::integer,returning_basis_points=(payload->>'returningBasisPoints')::integer,updated_at=now() WHERE id RETURNING to_jsonb(acquisition_pricing_draft.*) INTO next_value;
 ELSIF action IN('open','close','retire') THEN
  SELECT state,to_jsonb(p) INTO current_state,prior FROM beauty.founding_programme p WHERE id FOR UPDATE;
  IF current_state='retired' THEN RAISE EXCEPTION 'PROGRAMME_RETIRED' USING ERRCODE='22023'; END IF;
  IF action='retire' AND payload->>'confirmation' IS DISTINCT FROM 'PERMANENTLY RETIRE FOUNDING PROGRAMME' THEN RAISE EXCEPTION 'TYPED_CONFIRMATION_REQUIRED' USING ERRCODE='22023'; END IF;
  UPDATE beauty.founding_programme SET state=CASE action WHEN 'open' THEN 'open' WHEN 'close' THEN 'closed' ELSE 'retired' END,
  updated_at=now(),retired_at=CASE WHEN action='retire' THEN now() ELSE NULL END WHERE id RETURNING to_jsonb(founding_programme.*) INTO next_value;
 ELSE RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 INSERT INTO beauty.financial_admin_audit_logs(actor_user_id,action,target_type,reason,previous_state,new_state)
 VALUES(actor,'programme.'||action,CASE WHEN action='pricing_draft' THEN 'acquisition_pricing_draft' ELSE 'founding_programme' END,reason,prior,next_value);
END $$;
-- Public copy must use this gate; regular professional enrolment never uses it.
CREATE FUNCTION beauty.public_founding_programme_open() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT state='open' FROM beauty.founding_programme WHERE id
$$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.guard_founding_enrolment() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_programme_overview() OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.owner_programme_action(jsonb) OWNER TO beauty_admin_ops;
ALTER FUNCTION beauty.public_founding_programme_open() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.guard_founding_programme(),beauty.guard_founding_enrolment(),beauty.owner_programme_overview(),beauty.owner_programme_action(jsonb),beauty.public_founding_programme_open() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_programme_overview(),beauty.owner_programme_action(jsonb),beauty.public_founding_programme_open() TO beauty_app;

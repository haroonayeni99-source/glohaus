-- Additive future categories. Existing catalogue IDs, services and prices stay intact.
SET LOCAL lock_timeout = '5s';
INSERT INTO beauty.specialities(category_id,name,slug,description)
SELECT id,'Editorial Makeup','editorial-makeup','Makeup for editorial, photography and creative work.'
FROM beauty.platform_categories WHERE taxonomy_key='makeup' ON CONFLICT(slug) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes)
SELECT id,'Editorial Makeup','editorial-makeup-session',90 FROM beauty.specialities WHERE slug='editorial-makeup' ON CONFLICT(slug) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id)
SELECT 'MUA','category',id FROM beauty.platform_categories WHERE taxonomy_key='makeup' ON CONFLICT(normalised) DO NOTHING;

INSERT INTO beauty.platform_categories(name,slug,taxonomy_key,active,sort_order,description)
VALUES ('Teeth Whitening','teeth-whitening','teeth-whitening',false,180,'Future service. A GDC-registered dentist, current insurance and clinical safeguards must be reviewed before bookings can open.'),
('Tattoos','tattoos','tattoos',false,190,'Future launch. Keep hidden until the Owner opens it. Provider/premises registration or licensing, insurance and hygiene safeguards require review.')
ON CONFLICT(slug) DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM beauty.services s JOIN beauty.platform_categories c ON c.id=s.category_id WHERE c.slug IN('teeth-whitening','tattoos')) THEN
  RAISE EXCEPTION 'Existing regulated services need a separate migration review';
 END IF;
END $$;
UPDATE beauty.platform_categories SET active=false WHERE slug IN('teeth-whitening','tattoos');
INSERT INTO beauty.specialities(category_id,name,slug)
SELECT id,name,slug||'-services' FROM beauty.platform_categories WHERE slug IN('teeth-whitening','tattoos') ON CONFLICT(slug) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes)
SELECT id,CASE slug WHEN 'teeth-whitening-services' THEN 'Dentist-led whitening consultation' ELSE 'Tattoo consultation' END,
slug||'-consultation',30 FROM beauty.specialities WHERE slug IN('teeth-whitening-services','tattoos-services') ON CONFLICT(slug) DO NOTHING;

CREATE TABLE beauty.regulatory_categories(
 category_id uuid PRIMARY KEY REFERENCES beauty.platform_categories(id),
 kind text NOT NULL UNIQUE CHECK(kind IN('dentistry','tattoo'))
);
INSERT INTO beauty.regulatory_categories SELECT id,CASE slug WHEN 'teeth-whitening' THEN 'dentistry' ELSE 'tattoo' END
FROM beauty.platform_categories WHERE slug IN('teeth-whitening','tattoos');
CREATE TABLE beauty.professional_regulatory_clearances(
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 category_id uuid NOT NULL REFERENCES beauty.regulatory_categories(category_id),
 status text NOT NULL CHECK(status IN('approved','revoked')),
 registration_reference text NOT NULL CHECK(length(registration_reference) BETWEEN 2 AND 120),
 valid_until timestamptz NOT NULL,
 register_checked boolean NOT NULL, insurance_checked boolean NOT NULL, safeguards_checked boolean NOT NULL,
 dentist_confirmed boolean NOT NULL DEFAULT false,
 reviewed_by uuid NOT NULL REFERENCES beauty.users(id),
 review_reason text NOT NULL CHECK(length(trim(review_reason)) BETWEEN 5 AND 1000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(professional_id,category_id),
 CHECK(status<>'approved' OR (register_checked AND insurance_checked AND safeguards_checked))
);
CREATE INDEX regulatory_clearances_category_idx ON beauty.professional_regulatory_clearances(category_id,professional_id);
CREATE INDEX regulatory_clearances_reviewer_idx ON beauty.professional_regulatory_clearances(reviewed_by);
ALTER TABLE beauty.regulatory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.regulatory_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_regulatory_clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_regulatory_clearances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.regulatory_categories,beauty.professional_regulatory_clearances FROM PUBLIC,anon,authenticated,beauty_app,beauty_catalog;
CREATE POLICY regulatory_categories_no_direct_access ON beauty.regulatory_categories FOR ALL TO anon,authenticated,beauty_app USING(false) WITH CHECK(false);
CREATE POLICY regulatory_clearances_no_direct_access ON beauty.professional_regulatory_clearances FOR ALL TO anon,authenticated,beauty_app USING(false) WITH CHECK(false);

-- Deliberately privileged, boolean-only gate over private evidence. No public RPC grants.
CREATE FUNCTION beauty.regulatory_service_allowed(target_professional uuid,target_category uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM beauty.regulatory_categories WHERE category_id=target_category) THEN true ELSE EXISTS(
  SELECT 1 FROM beauty.professional_regulatory_clearances r JOIN beauty.regulatory_categories g ON g.category_id=r.category_id
  JOIN beauty.platform_categories c ON c.id=r.category_id JOIN beauty.professional_trust_status p ON p.professional_id=r.professional_id
  WHERE r.professional_id=target_professional AND r.category_id=target_category AND c.active AND r.status='approved' AND r.valid_until>now()
  AND p.verification_status='verified' AND (g.kind<>'dentistry' OR r.dentist_confirmed)
 ) END
$$;
REVOKE ALL ON FUNCTION beauty.regulatory_service_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.regulatory_service_allowed(uuid,uuid) TO beauty_app,beauty_catalog,beauty_booking_ops;

CREATE FUNCTION beauty.protect_regulatory_category() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM beauty.regulatory_categories WHERE category_id=OLD.id) THEN PERFORM beauty.require_owner(); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_regulatory_category BEFORE UPDATE ON beauty.platform_categories FOR EACH ROW EXECUTE FUNCTION beauty.protect_regulatory_category();
CREATE FUNCTION beauty.check_regulatory_service() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.active AND NEW.publication_status='published' AND NOT beauty.regulatory_service_allowed(NEW.professional_id,NEW.category_id) THEN
  RAISE EXCEPTION 'VERIFICATION_REQUIRED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_check_regulatory_service BEFORE INSERT OR UPDATE OF professional_id,category_id,active,publication_status ON beauty.services FOR EACH ROW EXECUTE FUNCTION beauty.check_regulatory_service();
CREATE FUNCTION beauty.check_regulatory_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE svc beauty.services; BEGIN
 SELECT * INTO svc FROM beauty.services WHERE id=NEW.service_id;
 IF EXISTS(SELECT 1 FROM beauty.regulatory_categories WHERE category_id=svc.category_id) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory:'||svc.professional_id::text||':'||svc.category_id::text,0));
 END IF;
 IF NOT beauty.regulatory_service_allowed(svc.professional_id,svc.category_id) THEN RAISE EXCEPTION 'UNAVAILABLE_SERVICE' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aaa_check_regulatory_booking BEFORE INSERT ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.check_regulatory_booking();
REVOKE ALL ON FUNCTION beauty.protect_regulatory_category(),beauty.check_regulatory_service(),beauty.check_regulatory_booking() FROM PUBLIC,anon,authenticated,beauty_app;

-- Wrap the current view, retaining every existing visibility/safety predicate and column.
DO $$ DECLARE definition text; BEGIN
 definition:=regexp_replace(pg_get_viewdef('beauty.public_services'::regclass,true),';[[:space:]]*$','');
 EXECUTE format('CREATE OR REPLACE VIEW beauty.public_services WITH(security_barrier=true) AS SELECT existing.* FROM (%s) existing WHERE beauty.regulatory_service_allowed(existing.professional_id,existing.category_id)',definition);
END $$;
-- Add eligibility to the existing quote without copying or changing its money calculations.
DO $$ DECLARE definition text; needle text:=$n$extras:=coalesce(extras,'{}');$n$; BEGIN
 definition:=pg_get_functiondef('beauty.service_quote_row(uuid,uuid,uuid[])'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Service quote definition needs a separate migration review'; END IF;
 EXECUTE replace(definition,needle,$r$IF NOT beauty.regulatory_service_allowed(svc.professional_id,svc.category_id) THEN RAISE EXCEPTION 'UNAVAILABLE_SERVICE' USING ERRCODE='22023'; END IF; extras:=coalesce(extras,'{}');$r$);
END $$;

CREATE FUNCTION beauty.owner_regulatory_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_owner();
 RETURN jsonb_build_object(
  'categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'active',c.active,'kind',r.kind) ORDER BY c.sort_order),'[]') FROM beauty.regulatory_categories r JOIN beauty.platform_categories c ON c.id=r.category_id),
  'approvals',(SELECT coalesce(jsonb_agg(x),'[]') FROM(SELECT r.professional_id,r.category_id,p.business_name,r.status,r.registration_reference,r.valid_until,(r.valid_until<=now()) AS expired,r.updated_at FROM beauty.professional_regulatory_clearances r JOIN beauty.professional_profiles p ON p.id=r.professional_id ORDER BY r.updated_at DESC LIMIT 100)x)
 );
END $$;
CREATE FUNCTION beauty.owner_set_regulatory_clearance(input jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_owner(); pro uuid:=(input->>'professionalId')::uuid; cat uuid:=(input->>'categoryId')::uuid; kind text; expiry timestamptz; reason text:=trim(coalesce(input->>'reason','')); BEGIN
 SELECT r.kind INTO kind FROM beauty.regulatory_categories r WHERE category_id=cat;
 IF kind IS NULL OR length(reason) NOT BETWEEN 5 AND 1000 OR input->>'status' NOT IN('approved','revoked') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('regulatory:'||pro::text||':'||cat::text,0));
 IF input->>'status'='revoked' THEN
  UPDATE beauty.professional_regulatory_clearances SET status='revoked',reviewed_by=actor,review_reason=reason,updated_at=now() WHERE professional_id=pro AND category_id=cat;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 ELSE
  expiry:=(input->>'validUntil')::date::timestamp AT TIME ZONE 'Europe/London';
  IF NOT coalesce(input->'registerChecked'='true'::jsonb,false) OR NOT coalesce(input->'insuranceChecked'='true'::jsonb,false) OR NOT coalesce(input->'safeguardsChecked'='true'::jsonb,false)
   OR expiry IS NULL OR expiry<=now() OR expiry>now()+interval '1 year' OR length(trim(coalesce(input->>'registrationReference',''))) NOT BETWEEN 2 AND 120
   OR NOT EXISTS(SELECT 1 FROM beauty.professional_trust_status WHERE professional_id=pro AND verification_status='verified')
   OR (kind='dentistry' AND (NOT coalesce(input->'dentistConfirmed'='true'::jsonb,false) OR coalesce(input->>'registrationReference','')!~'^[0-9]{1,8}$'))
  THEN RAISE EXCEPTION 'VERIFICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  INSERT INTO beauty.professional_regulatory_clearances(professional_id,category_id,status,registration_reference,valid_until,register_checked,insurance_checked,safeguards_checked,dentist_confirmed,reviewed_by,review_reason)
  VALUES(pro,cat,'approved',trim(input->>'registrationReference'),expiry,true,true,true,coalesce((input->>'dentistConfirmed')::boolean,false),actor,reason)
  ON CONFLICT(professional_id,category_id) DO UPDATE SET status='approved',registration_reference=excluded.registration_reference,valid_until=excluded.valid_until,register_checked=true,insurance_checked=true,safeguards_checked=true,dentist_confirmed=excluded.dentist_confirmed,reviewed_by=actor,review_reason=reason,updated_at=now();
 END IF;
 PERFORM beauty.write_admin_audit(actor,'owner','regulatory.clearance',(SELECT user_id FROM beauty.professional_profiles WHERE id=pro),'professional',pro,reason,jsonb_build_object('categoryId',cat,'status',input->>'status','validUntil',expiry));
END $$;
REVOKE ALL ON FUNCTION beauty.owner_regulatory_overview(),beauty.owner_set_regulatory_clearance(jsonb) FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.owner_regulatory_overview(),beauty.owner_set_regulatory_clearance(jsonb) TO beauty_app;

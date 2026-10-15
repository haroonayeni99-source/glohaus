-- Additive taxonomy. No speciality is inferred for an existing professional or service.
CREATE FUNCTION beauty.normalise_treatment(term text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT trim(regexp_replace(lower(coalesce(term,'')),'[^a-z0-9]+',' ','g')) $$;
ALTER TABLE beauty.platform_categories ADD COLUMN description text NOT NULL DEFAULT '' CHECK(length(description)<=1000), ADD COLUMN image_url text CHECK(image_url IS NULL OR (length(image_url)<=2048 AND image_url~'^https://[^[:space:]]+$')), ADD COLUMN taxonomy_key text UNIQUE, ADD COLUMN canonical_category_id uuid REFERENCES beauty.platform_categories(id), ADD COLUMN legacy_only boolean NOT NULL DEFAULT false;
CREATE TABLE beauty.specialities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES beauty.platform_categories(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 80),slug text NOT NULL UNIQUE CHECK(slug~'^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=100),description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 active boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 100 CHECK(sort_order BETWEEN 0 AND 10000),merged_into_id uuid REFERENCES beauty.specialities(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,category_id),CHECK(merged_into_id IS NULL OR merged_into_id<>id)
);
CREATE INDEX specialities_category_idx ON beauty.specialities(category_id,active,sort_order);
CREATE INDEX specialities_merge_idx ON beauty.specialities(merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE TABLE beauty.service_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),speciality_id uuid NOT NULL REFERENCES beauty.specialities(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 100),slug text NOT NULL UNIQUE CHECK(slug~'^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=100),description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
 active boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 100 CHECK(sort_order BETWEEN 0 AND 10000),suggested_duration_minutes integer CHECK(suggested_duration_minutes BETWEEN 15 AND 480 AND suggested_duration_minutes%5=0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,speciality_id)
);
CREATE INDEX service_templates_speciality_idx ON beauty.service_templates(speciality_id,active,sort_order);
CREATE TABLE beauty.treatment_aliases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),term text NOT NULL CHECK(length(trim(term)) BETWEEN 2 AND 100),normalised text GENERATED ALWAYS AS(beauty.normalise_treatment(term)) STORED UNIQUE,
 target_kind text NOT NULL CHECK(target_kind IN('category','speciality','template')),target_id uuid NOT NULL
);
CREATE INDEX treatment_aliases_target_idx ON beauty.treatment_aliases(target_kind,target_id);
CREATE TABLE beauty.professional_categories(
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),category_id uuid NOT NULL REFERENCES beauty.platform_categories(id),PRIMARY KEY(professional_id,category_id)
);
CREATE INDEX professional_categories_category_idx ON beauty.professional_categories(category_id,professional_id);
CREATE TABLE beauty.professional_specialities(
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),speciality_id uuid NOT NULL REFERENCES beauty.specialities(id),is_primary boolean NOT NULL DEFAULT false,selected_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(professional_id,speciality_id)
);
CREATE UNIQUE INDEX professional_specialities_primary_idx ON beauty.professional_specialities(professional_id) WHERE is_primary;
CREATE INDEX professional_specialities_speciality_idx ON beauty.professional_specialities(speciality_id,professional_id);
ALTER TABLE beauty.professional_profiles ADD COLUMN taxonomy_confirmed_at timestamptz;
ALTER TABLE beauty.services ADD COLUMN category_id uuid REFERENCES beauty.platform_categories(id),ADD COLUMN speciality_id uuid,ADD COLUMN template_id uuid,
 ADD COLUMN publication_status text NOT NULL DEFAULT 'published' CHECK(publication_status IN('published','draft','inactive')),
 ADD COLUMN categorisation_status text NOT NULL DEFAULT 'approved' CHECK(categorisation_status IN('approved','needs_review','blocked')),
 ADD COLUMN categorisation_reason text NOT NULL DEFAULT '' CHECK(length(categorisation_reason)<=500),
 ADD CONSTRAINT services_speciality_category_fk FOREIGN KEY(speciality_id,category_id) REFERENCES beauty.specialities(id,category_id) DEFERRABLE INITIALLY DEFERRED,
 ADD CONSTRAINT services_template_speciality_fk FOREIGN KEY(template_id,speciality_id) REFERENCES beauty.service_templates(id,speciality_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX services_category_id_idx ON beauty.services(category_id);
CREATE INDEX services_speciality_published_idx ON beauty.services(speciality_id,price_pence,professional_id) WHERE active AND publication_status='published' AND categorisation_status='approved';
CREATE INDEX services_template_published_idx ON beauty.services(template_id,professional_id) WHERE active AND publication_status='published' AND categorisation_status='approved';
CREATE INDEX services_name_search_idx ON beauty.services USING gin(to_tsvector('simple',name));
CREATE TABLE beauty.service_options(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),service_id uuid NOT NULL REFERENCES beauty.services(id),kind text NOT NULL CHECK(kind IN('variation','extra')),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 80),price_pence integer NOT NULL CHECK(price_pence BETWEEN 0 AND 1000000),duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 0 AND 480 AND duration_minutes%5=0),
 active boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 100 CHECK(sort_order BETWEEN 0 AND 10000),attributes jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(attributes)='object' AND length(attributes::text)<=1200),
 CHECK(kind<>'variation' OR (price_pence>=100 AND duration_minutes>=15)),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_options_service_idx ON beauty.service_options(service_id,kind,sort_order);
ALTER TABLE beauty.posts ADD COLUMN speciality_id uuid REFERENCES beauty.specialities(id);
CREATE INDEX posts_speciality_idx ON beauty.posts(speciality_id,created_at DESC,id DESC) WHERE publication_status='published' AND moderation_status='visible';
CREATE TABLE beauty.portfolio_specialities(asset_id uuid NOT NULL REFERENCES beauty.portfolio_assets(id),speciality_id uuid NOT NULL REFERENCES beauty.specialities(id),PRIMARY KEY(asset_id,speciality_id));
CREATE INDEX portfolio_specialities_speciality_idx ON beauty.portfolio_specialities(speciality_id,asset_id);
ALTER TABLE beauty.bookings ADD COLUMN taxonomy_snapshot jsonb NOT NULL DEFAULT '{}',ADD COLUMN service_options_snapshot jsonb NOT NULL DEFAULT '{}';
CREATE TABLE beauty.taxonomy_demand_daily(day date NOT NULL,target_kind text NOT NULL CHECK(target_kind IN('category','speciality','template')),target_id uuid NOT NULL,hits bigint NOT NULL DEFAULT 1 CHECK(hits>0),PRIMARY KEY(day,target_kind,target_id));
CREATE INDEX taxonomy_demand_target_idx ON beauty.taxonomy_demand_daily(target_kind,target_id,day);

-- Reuse known category records, retaining their IDs, names and all historical references.
DO $$ DECLARE item record; target uuid; BEGIN
 FOR item IN SELECT * FROM (VALUES('hair','Hair'),('nails','Nails'),('makeup','Makeup'),('skin','Skin'),('lashes','Lashes'),('brows','Brows'),('hair-removal','Hair Removal'),('aesthetics','Aesthetics')) AS roots(key,name) LOOP
  SELECT id INTO target FROM beauty.platform_categories WHERE lower(name)=lower(item.name) OR slug=item.key ORDER BY (slug=item.key) DESC LIMIT 1;
  IF target IS NULL THEN INSERT INTO beauty.platform_categories(name,slug) VALUES(item.name,item.key) RETURNING id INTO target; END IF;
  UPDATE beauty.platform_categories SET taxonomy_key=item.key WHERE id=target;
 END LOOP;
 UPDATE beauty.platform_categories old SET canonical_category_id=root.id,legacy_only=true FROM beauty.platform_categories root WHERE (lower(old.name)='barber' AND root.taxonomy_key='hair') OR (lower(old.name)='waxing' AND root.taxonomy_key='hair-removal') OR (lower(old.name)='injectables' AND root.taxonomy_key='aesthetics');
 UPDATE beauty.platform_categories SET legacy_only=true WHERE lower(name)='lashes & brows';
END $$;
UPDATE beauty.services s SET category_id=coalesce(c.canonical_category_id,c.id) FROM beauty.platform_categories c WHERE lower(c.name)=lower(s.category);
INSERT INTO beauty.professional_categories(professional_id,category_id) SELECT p.id,coalesce(c.canonical_category_id,c.id) FROM beauty.professional_profiles p JOIN beauty.platform_categories c ON lower(c.name)=lower(p.category) ON CONFLICT DO NOTHING;
-- No INSERT into professional_specialities or assignment of services.speciality_id here.
ALTER TABLE beauty.services ADD CONSTRAINT services_speciality_requires_category CHECK(speciality_id IS NULL OR category_id IS NOT NULL),ADD CONSTRAINT services_template_requires_speciality CHECK(template_id IS NULL OR speciality_id IS NOT NULL);

-- Public reference definitions; personal relationships remain owner-only except
-- for deliberately limited projections belonging to published professionals.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['specialities','service_templates','treatment_aliases','professional_categories','professional_specialities','service_options','portfolio_specialities','taxonomy_demand_daily'] LOOP
  EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['specialities','service_templates','treatment_aliases'] LOOP
  EXECUTE format('CREATE POLICY taxonomy_reference_read ON beauty.%I FOR SELECT TO beauty_app,beauty_catalog USING(true)',t);
  EXECUTE format('GRANT SELECT ON beauty.%I TO beauty_app,beauty_catalog',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['professional_categories','professional_specialities'] LOOP
  EXECUTE format('CREATE POLICY taxonomy_owner_read ON beauty.%I FOR SELECT TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id))',t);
  EXECUTE format('CREATE POLICY taxonomy_catalog_read ON beauty.%I FOR SELECT TO beauty_catalog USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id AND p.publication_status=''published''))',t);
  EXECUTE format('GRANT SELECT ON beauty.%I TO beauty_app,beauty_catalog',t);
 END LOOP;
END $$;
GRANT SELECT ON beauty.platform_categories TO beauty_catalog;
CREATE POLICY taxonomy_categories_catalog_read ON beauty.platform_categories FOR SELECT TO beauty_catalog USING(true);
CREATE POLICY service_options_owner ON beauty.service_options FOR ALL TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.services s WHERE s.id=service_id)) WITH CHECK(EXISTS(SELECT 1 FROM beauty.services s WHERE s.id=service_id));
CREATE POLICY service_options_catalog ON beauty.service_options FOR SELECT TO beauty_catalog USING(active AND EXISTS(SELECT 1 FROM beauty.services s WHERE s.id=service_id AND s.active AND s.publication_status='published' AND s.categorisation_status='approved'));
GRANT SELECT,INSERT,UPDATE ON beauty.service_options TO beauty_app;
GRANT SELECT ON beauty.service_options TO beauty_catalog;
CREATE POLICY portfolio_specialities_owner ON beauty.portfolio_specialities FOR ALL TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.portfolio_assets a WHERE a.id=asset_id)) WITH CHECK(EXISTS(SELECT 1 FROM beauty.portfolio_assets a WHERE a.id=asset_id));
CREATE POLICY portfolio_specialities_catalog ON beauty.portfolio_specialities FOR SELECT TO beauty_catalog USING(EXISTS(SELECT 1 FROM beauty.portfolio_assets a WHERE a.id=asset_id AND a.publication_status='published'));
GRANT SELECT,INSERT,DELETE ON beauty.portfolio_specialities TO beauty_app;
GRANT SELECT ON beauty.portfolio_specialities TO beauty_catalog;
GRANT SELECT(taxonomy_confirmed_at) ON beauty.professional_profiles TO beauty_catalog;
GRANT INSERT(category_id,speciality_id,template_id,publication_status),UPDATE(category_id,speciality_id,template_id,publication_status) ON beauty.services TO beauty_app;
GRANT INSERT(speciality_id),UPDATE(speciality_id) ON beauty.posts TO beauty_app;

CREATE VIEW beauty.public_professional_specialities WITH(security_barrier=true) AS
 SELECT ps.professional_id,s.id AS speciality_id,s.name,s.slug,s.category_id,c.name AS category_name,ps.is_primary
 FROM beauty.professional_specialities ps JOIN beauty.specialities s ON s.id=ps.speciality_id JOIN beauty.platform_categories c ON c.id=s.category_id
 WHERE s.active AND s.merged_into_id IS NULL AND c.active;
CREATE VIEW beauty.public_portfolio_specialities WITH(security_barrier=true) AS
 SELECT link.asset_id,link.speciality_id,s.name AS speciality_name FROM beauty.portfolio_specialities link JOIN beauty.specialities s ON s.id=link.speciality_id WHERE s.active;
CREATE VIEW beauty.public_service_options WITH(security_barrier=true) AS
 SELECT id,service_id,kind,name,price_pence,duration_minutes,active,sort_order,attributes FROM beauty.service_options WHERE active;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_professional_specialities OWNER TO beauty_catalog;
ALTER VIEW beauty.public_portfolio_specialities OWNER TO beauty_catalog;
ALTER VIEW beauty.public_service_options OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_professional_specialities,beauty.public_portfolio_specialities,beauty.public_service_options TO beauty_app;

CREATE FUNCTION beauty.taxonomy_catalog(include_inactive boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
 'categories',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order,c.name) FROM beauty.platform_categories c WHERE include_inactive OR (c.active AND NOT c.legacy_only)),'[]'),
 'specialities',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sort_order,s.name) FROM beauty.specialities s JOIN beauty.platform_categories c ON c.id=s.category_id WHERE include_inactive OR (s.active AND s.merged_into_id IS NULL AND c.active AND NOT c.legacy_only)),'[]'),
 'templates',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order,t.name) FROM beauty.service_templates t JOIN beauty.specialities s ON s.id=t.speciality_id JOIN beauty.platform_categories c ON c.id=s.category_id WHERE include_inactive OR (t.active AND s.active AND s.merged_into_id IS NULL AND c.active AND NOT c.legacy_only)),'[]'),
 'aliases',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.term) FROM beauty.treatment_aliases a),'[]'));
$$;
CREATE FUNCTION beauty.my_speciality_selection() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid:=beauty.policy_actor_professional(); BEGIN
 RETURN jsonb_build_object('categoryIds',coalesce((SELECT jsonb_agg(category_id ORDER BY category_id) FROM beauty.professional_categories WHERE professional_id=pro),'[]'),
 'specialityIds',coalesce((SELECT jsonb_agg(speciality_id ORDER BY speciality_id) FROM beauty.professional_specialities WHERE professional_id=pro),'[]'),
 'primarySpecialityId',(SELECT speciality_id FROM beauty.professional_specialities WHERE professional_id=pro AND is_primary),
 'confirmedAt',(SELECT taxonomy_confirmed_at FROM beauty.professional_profiles WHERE id=pro),
 'publishedBySpeciality',coalesce((SELECT jsonb_object_agg(speciality_id,total) FROM(SELECT speciality_id,count(*) AS total FROM beauty.services WHERE professional_id=pro AND active AND publication_status='published' AND speciality_id IS NOT NULL GROUP BY speciality_id) counted),'{}'),
 'unclassifiedServices',(SELECT count(*) FROM beauty.services WHERE professional_id=pro AND speciality_id IS NULL));
END $$;
CREATE FUNCTION beauty.save_my_specialities(categories uuid[],specialities uuid[],primary_speciality uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid:=beauty.policy_actor_professional(); BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('policies:'||pro::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(pro::text,0));
 IF categories IS NULL OR specialities IS NULL OR cardinality(categories) NOT BETWEEN 1 AND 20 OR cardinality(specialities) NOT BETWEEN 1 AND 40
 OR primary_speciality IS NULL OR NOT primary_speciality=ANY(specialities)
 OR (SELECT count(DISTINCT x) FROM unnest(categories) x)<>cardinality(categories)
 OR (SELECT count(DISTINCT x) FROM unnest(specialities) x)<>cardinality(specialities)
 OR EXISTS(SELECT 1 FROM unnest(categories) x LEFT JOIN beauty.platform_categories c ON c.id=x WHERE c.id IS NULL OR NOT c.active OR c.legacy_only)
 OR EXISTS(SELECT 1 FROM unnest(specialities) x LEFT JOIN beauty.specialities s ON s.id=x WHERE s.id IS NULL OR NOT s.active OR s.merged_into_id IS NOT NULL OR NOT s.category_id=ANY(categories))
 OR EXISTS(SELECT 1 FROM unnest(categories) c WHERE NOT EXISTS(SELECT 1 FROM beauty.specialities s WHERE s.category_id=c AND s.id=ANY(specialities))) THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
 -- Removing a declaration pauses its services but never deletes a service,
 -- option, portfolio asset, payment, policy or historical booking.
 UPDATE beauty.services SET active=false,publication_status='inactive' WHERE professional_id=pro AND speciality_id IS NOT NULL AND NOT speciality_id=ANY(specialities);
 DELETE FROM beauty.professional_specialities WHERE professional_id=pro AND NOT speciality_id=ANY(specialities);
 UPDATE beauty.professional_specialities SET is_primary=false WHERE professional_id=pro;
 INSERT INTO beauty.professional_specialities(professional_id,speciality_id,is_primary) SELECT pro,x,x=primary_speciality FROM unnest(specialities) x ON CONFLICT(professional_id,speciality_id) DO UPDATE SET is_primary=excluded.is_primary;
 DELETE FROM beauty.professional_categories WHERE professional_id=pro AND NOT category_id=ANY(categories);
 INSERT INTO beauty.professional_categories SELECT pro,x FROM unnest(categories) x ON CONFLICT DO NOTHING;
 UPDATE beauty.professional_profiles SET taxonomy_confirmed_at=now() WHERE id=pro;
 RETURN beauty.my_speciality_selection();
END $$;

CREATE FUNCTION beauty.validate_service_taxonomy() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE sp beauty.specialities; tpl beauty.service_templates; cat beauty.platform_categories; BEGIN
 IF NEW.category_id IS NULL THEN SELECT id INTO NEW.category_id FROM beauty.platform_categories WHERE lower(name)=lower(NEW.category) LIMIT 1; END IF;
 IF NEW.speciality_id IS NOT NULL THEN
  SELECT * INTO sp FROM beauty.specialities WHERE id=NEW.speciality_id;
  SELECT * INTO cat FROM beauty.platform_categories WHERE id=NEW.category_id;
  IF sp.id IS NULL OR cat.id IS NULL OR sp.category_id<>cat.id OR (NEW.active AND NEW.publication_status='published' AND NOT EXISTS(SELECT 1 FROM beauty.professional_specialities WHERE professional_id=NEW.professional_id AND speciality_id=sp.id)) THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
  IF NEW.active AND NEW.publication_status='published' AND (NOT sp.active OR sp.merged_into_id IS NOT NULL OR NOT cat.active OR cat.legacy_only) THEN RAISE EXCEPTION 'INACTIVE_TAXONOMY' USING ERRCODE='22023'; END IF;
  IF NEW.template_id IS NOT NULL THEN
   SELECT * INTO tpl FROM beauty.service_templates WHERE id=NEW.template_id;
   IF tpl.id IS NULL OR tpl.speciality_id<>sp.id OR (NEW.active AND NEW.publication_status='published' AND NOT tpl.active) THEN RAISE EXCEPTION 'INVALID_TEMPLATE' USING ERRCODE='22023'; END IF;
  END IF;
  NEW.category:=cat.name;
 ELSIF NEW.template_id IS NOT NULL THEN RAISE EXCEPTION 'INVALID_TEMPLATE' USING ERRCODE='22023';
 END IF;
 IF NEW.publication_status<>'published' THEN NEW.active:=false; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_service_taxonomy BEFORE INSERT OR UPDATE OF category,category_id,speciality_id,template_id,publication_status,active ON beauty.services FOR EACH ROW EXECUTE FUNCTION beauty.validate_service_taxonomy();

CREATE FUNCTION beauty.save_my_service_options(target_service uuid,variations jsonb,extras jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid:=beauty.policy_actor_professional(); item jsonb; option_kind text; option_id uuid; seen uuid[]:='{}'; access jsonb; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('policies:'||pro::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(pro::text,0));
 IF NOT EXISTS(SELECT 1 FROM beauty.services WHERE id=target_service AND professional_id=pro) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(variations) IS DISTINCT FROM 'array' OR jsonb_typeof(extras) IS DISTINCT FROM 'array' OR jsonb_array_length(variations)>20 OR jsonb_array_length(extras)>10 THEN RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE='22023'; END IF;
 access:=beauty.professional_access_state(pro);
 FOR option_kind IN SELECT unnest(ARRAY['variation','extra']) LOOP
  FOR item IN SELECT value FROM jsonb_array_elements(CASE WHEN option_kind='variation' THEN variations ELSE extras END) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR length(trim(coalesce(item->>'name',''))) NOT BETWEEN 2 AND 80
    OR jsonb_typeof(item->'pricePence') IS DISTINCT FROM 'number' OR (item->>'pricePence')!~'^[0-9]+$' OR (item->>'pricePence')::numeric NOT BETWEEN (CASE WHEN option_kind='variation' THEN 100 ELSE 0 END) AND 1000000
    OR jsonb_typeof(item->'durationMinutes') IS DISTINCT FROM 'number' OR (item->>'durationMinutes')!~'^[0-9]+$' OR (item->>'durationMinutes')::numeric NOT BETWEEN (CASE WHEN option_kind='variation' THEN 15 ELSE 0 END) AND 480 OR (item->>'durationMinutes')::integer%5<>0
    OR jsonb_typeof(item->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'sortOrder') IS DISTINCT FROM 'number' OR (item->>'sortOrder')!~'^[0-9]+$' OR (item->>'sortOrder')::numeric NOT BETWEEN 0 AND 10000
    OR jsonb_typeof(item->'attributes') IS DISTINCT FROM 'object' OR length((item->'attributes')::text)>1200 THEN RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE='22023'; END IF;
   IF NOT coalesce((access->>'verified')::boolean,false) AND (item->>'active')::boolean AND (item->>'pricePence')::integer>20000 THEN RAISE EXCEPTION 'VERIFICATION_REQUIRED' USING ERRCODE='42501'; END IF;
   option_id:=nullif(item->>'id','')::uuid;
   IF option_id IS NOT NULL AND (option_id=ANY(seen) OR NOT EXISTS(SELECT 1 FROM beauty.service_options WHERE id=option_id AND service_id=target_service AND kind=option_kind)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
   IF option_id IS NULL THEN option_id:=gen_random_uuid(); END IF;
   seen:=array_append(seen,option_id);
   INSERT INTO beauty.service_options(id,service_id,kind,name,price_pence,duration_minutes,active,sort_order,attributes) VALUES(option_id,target_service,option_kind,trim(item->>'name'),(item->>'pricePence')::int,(item->>'durationMinutes')::int,(item->>'active')::boolean,(item->>'sortOrder')::int,item->'attributes')
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,price_pence=excluded.price_pence,duration_minutes=excluded.duration_minutes,active=excluded.active,sort_order=excluded.sort_order,attributes=excluded.attributes;
  END LOOP;
 END LOOP;
 UPDATE beauty.service_options SET active=false WHERE service_id=target_service AND NOT id=ANY(seen);
END $$;

-- Options change only the in-memory quote, never the underlying service row.
-- Existing financial, trial, policy, calendar and payment functions remain the
-- authoritative reservation path and see the server-calculated quote.
CREATE FUNCTION beauty.service_quote_row(target_service uuid,variation uuid DEFAULT NULL,extras uuid[] DEFAULT '{}') RETURNS beauty.services LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE svc beauty.services; base_price integer; base_deposit integer; option beauty.service_options; extra uuid; BEGIN
 SELECT * INTO svc FROM beauty.services WHERE id=target_service;
 IF svc.id IS NULL OR NOT svc.active OR svc.publication_status<>'published' OR svc.categorisation_status<>'approved'
 OR NOT EXISTS(SELECT 1 FROM beauty.public_professionals WHERE id=svc.professional_id)
 OR (svc.template_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.service_templates WHERE id=svc.template_id AND active))
 OR (svc.speciality_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.specialities sp JOIN beauty.platform_categories c ON c.id=sp.category_id JOIN beauty.professional_specialities ps ON ps.speciality_id=sp.id AND ps.professional_id=svc.professional_id WHERE sp.id=svc.speciality_id AND sp.active AND sp.merged_into_id IS NULL AND c.active))
 THEN RAISE EXCEPTION 'UNAVAILABLE_SERVICE' USING ERRCODE='22023'; END IF;
 extras:=coalesce(extras,'{}');
 IF cardinality(extras)>10 OR (SELECT count(DISTINCT x) FROM unnest(extras) x)<>cardinality(extras) THEN RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE='22023'; END IF;
 base_price:=svc.price_pence; base_deposit:=svc.deposit_pence;
 IF variation IS NOT NULL THEN
  SELECT * INTO option FROM beauty.service_options WHERE id=variation AND service_id=target_service AND kind='variation' AND active;
  IF option.id IS NULL THEN RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE='22023'; END IF;
  svc.price_pence:=option.price_pence;svc.duration_minutes:=option.duration_minutes;
 END IF;
 FOREACH extra IN ARRAY extras LOOP
  SELECT * INTO option FROM beauty.service_options WHERE id=extra AND service_id=target_service AND kind='extra' AND active;
  IF option.id IS NULL THEN RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE='22023'; END IF;
  svc.price_pence:=svc.price_pence+option.price_pence;svc.duration_minutes:=svc.duration_minutes+option.duration_minutes;
 END LOOP;
 IF svc.price_pence NOT BETWEEN 100 AND 1000000 OR svc.duration_minutes NOT BETWEEN 15 AND 480 OR svc.duration_minutes%5<>0 THEN RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE='22023'; END IF;
 -- Preserve the service's required-deposit proportion. Published professional
 -- policy overrides and full prepayment for unverified accounts are still
 -- resolved by the existing public_service_policy/reservation functions.
 IF variation IS NOT NULL OR cardinality(extras)>0 THEN
  svc.deposit_pence:=least(floor(svc.price_pence*0.4)::int,round(svc.price_pence*base_deposit::numeric/base_price)::int);
 END IF;
 RETURN svc;
END $$;
CREATE FUNCTION beauty.service_quote(target_service uuid,variation uuid DEFAULT NULL,extras uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE svc beauty.services:=beauty.service_quote_row(target_service,variation,extras); BEGIN
 RETURN jsonb_build_object('serviceId',svc.id,'serviceName',svc.name,'professionalId',svc.professional_id,'pricePence',svc.price_pence,'depositPence',svc.deposit_pence,'durationMinutes',svc.duration_minutes,
 'variationId',variation,'extraIds',to_jsonb(coalesce(extras,'{}')),'variationName',(SELECT name FROM beauty.service_options WHERE id=variation),
 'extraNames',coalesce((SELECT jsonb_agg(o.name ORDER BY o.sort_order,o.id) FROM beauty.service_options o WHERE o.id=ANY(coalesce(extras,'{}'))),'[]'),
 'categoryId',svc.category_id,'specialityId',svc.speciality_id,'templateId',svc.template_id,'categoryName',coalesce((SELECT name FROM beauty.platform_categories WHERE id=svc.category_id),svc.category),
 'specialityName',(SELECT name FROM beauty.specialities WHERE id=svc.speciality_id));
END $$;
CREATE FUNCTION beauty.request_service_quote_row(target_service uuid) RETURNS beauty.services LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selection jsonb:=coalesce(nullif(current_setting('app.service_options',true),'')::jsonb,'{}'); BEGIN
 IF selection->>'serviceId' IS DISTINCT FROM target_service::text THEN selection:='{}'; END IF;
 RETURN beauty.service_quote_row(target_service,(selection->>'variationId')::uuid,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(selection->'extraIds','[]'))));
END $$;
CREATE FUNCTION beauty.request_service_quote(target_service uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selection jsonb:=coalesce(nullif(current_setting('app.service_options',true),'')::jsonb,'{}'); BEGIN
 IF selection->>'serviceId' IS DISTINCT FROM target_service::text THEN selection:='{}'; END IF;
 RETURN beauty.service_quote(target_service,(selection->>'variationId')::uuid,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(selection->'extraIds','[]'))));
END $$;

-- Fail closed if the deployed prerequisite bodies differ from the inspected
-- integration points. Do not replace any commission, payment or policy logic.
DO $$ DECLARE definition text; old text; BEGIN
 definition:=pg_get_functiondef('beauty.reserve_booking_before_policies(uuid,timestamptz)'::regprocedure);
 old:='SELECT * INTO service FROM beauty.services WHERE id=target_service AND active;';
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'RESERVATION_INTEGRATION_POINT_CHANGED'; END IF;
 definition:=replace(definition,old,'service:=beauty.request_service_quote_row(target_service);');
 old:='PERFORM pg_advisory_xact_lock(hashtextextended(professional.id::text,0));';
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'RESERVATION_LOCK_INTEGRATION_POINT_CHANGED'; END IF;
 definition:=replace(definition,old,old||E'\n  service:=beauty.request_service_quote_row(target_service);');
 EXECUTE definition;
 definition:=pg_get_functiondef('beauty.public_service_policy(uuid)'::regprocedure);
 old:='SELECT v.content,v.id,r.published_at INTO rules,general_id,published';
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'POLICY_QUOTE_INTEGRATION_POINT_CHANGED'; END IF;
 definition:=replace(definition,old,'s:=beauty.request_service_quote_row(target_service);'||E'\n '||old);
 old:='RETURN result||jsonb_build_object(''token'',md5(result::text));';
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'POLICY_TOKEN_INTEGRATION_POINT_CHANGED'; END IF;
 definition:=replace(definition,old,'result:=result||jsonb_build_object(''serviceOptions'',beauty.request_service_quote(target_service)||jsonb_build_object(''depositPence'',dep));'||E'\n '||old);
 EXECUTE definition;
END $$;
CREATE FUNCTION beauty.public_service_policy(target_service uuid,variation uuid,extras uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous text:=coalesce(current_setting('app.service_options',true),'');result jsonb; BEGIN
 PERFORM set_config('app.service_options',jsonb_build_object('serviceId',target_service,'variationId',variation,'extraIds',to_jsonb(coalesce(extras,'{}')))::text,true);
 result:=beauty.public_service_policy(target_service);
 PERFORM set_config('app.service_options',previous,true);RETURN result;
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.service_options',previous,true);RAISE;
END $$;
CREATE FUNCTION beauty.reserve_booking(target_service uuid,target_start timestamptz,accepted_token text,early_service boolean,variation uuid,extras uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous text:=coalesce(current_setting('app.service_options',true),'');result jsonb; BEGIN
 PERFORM set_config('app.service_options',jsonb_build_object('serviceId',target_service,'variationId',variation,'extraIds',to_jsonb(coalesce(extras,'{}')))::text,true);
 result:=beauty.reserve_booking(target_service,target_start,accepted_token,early_service);
 PERFORM set_config('app.service_options',previous,true);RETURN result;
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.service_options',previous,true);RAISE;
END $$;
CREATE FUNCTION beauty.snapshot_booked_service() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE quote jsonb; BEGIN
 IF nullif(current_setting('app.policy_acceptance',true),'') IS NULL THEN RETURN NEW; END IF;
 quote:=beauty.request_service_quote(NEW.service_id)||jsonb_build_object('depositPence',NEW.deposit_pence);
 IF NEW.price_pence IS DISTINCT FROM (quote->>'pricePence')::integer OR NEW.duration_minutes IS DISTINCT FROM (quote->>'durationMinutes')::integer THEN RAISE EXCEPTION 'POLICY_CHANGED' USING ERRCODE='22023'; END IF;
 NEW.taxonomy_snapshot:=jsonb_build_object('categoryId',quote->'categoryId','specialityId',quote->'specialityId','templateId',quote->'templateId','categoryName',quote->'categoryName','specialityName',quote->'specialityName');
 NEW.service_options_snapshot:=quote;
 RETURN NEW;
END $$;
CREATE TRIGGER aab_snapshot_booked_service BEFORE INSERT ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.snapshot_booked_service();
CREATE FUNCTION beauty.protect_service_booking_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.taxonomy_snapshot IS DISTINCT FROM OLD.taxonomy_snapshot OR NEW.service_options_snapshot IS DISTINCT FROM OLD.service_options_snapshot THEN RAISE EXCEPTION 'IMMUTABLE_BOOKING_SNAPSHOT' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_service_booking_snapshot BEFORE UPDATE OF taxonomy_snapshot,service_options_snapshot ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.protect_service_booking_snapshot();

CREATE OR REPLACE VIEW beauty.public_services WITH(security_barrier=true) AS
 SELECT s.id,s.professional_id,s.name,s.description,s.duration_minutes,s.price_pence,s.deposit_pence,a.id AS asset_id,a.alt_text AS image_alt,s.category,
 s.category_id,s.speciality_id,s.template_id,s.publication_status,sp.name AS speciality_name,c.name AS category_name,
 least(s.price_pence,coalesce((SELECT min(o.price_pence) FROM beauty.service_options o WHERE o.service_id=s.id AND o.kind='variation' AND o.active),s.price_pence)) AS from_price_pence,
 EXISTS(SELECT 1 FROM beauty.service_options o WHERE o.service_id=s.id AND o.active AND o.kind='variation') AS has_variations,media.media_type AS asset_media_type
 FROM beauty.services s LEFT JOIN beauty.public_portfolio a ON a.id=s.asset_id AND a.professional_id=s.professional_id
 LEFT JOIN beauty.public_media_assets media ON media.id=a.id
 LEFT JOIN beauty.specialities sp ON sp.id=s.speciality_id LEFT JOIN beauty.platform_categories c ON c.id=s.category_id
 WHERE s.active AND s.publication_status='published' AND s.categorisation_status='approved'
 AND (s.speciality_id IS NULL OR (sp.active AND sp.merged_into_id IS NULL AND c.active AND EXISTS(SELECT 1 FROM beauty.professional_specialities ps WHERE ps.professional_id=s.professional_id AND ps.speciality_id=s.speciality_id)))
 AND (s.template_id IS NULL OR EXISTS(SELECT 1 FROM beauty.service_templates t WHERE t.id=s.template_id AND t.active));

CREATE FUNCTION beauty.validate_content_speciality() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE linked uuid; BEGIN
 IF NEW.service_id IS NOT NULL THEN
  SELECT speciality_id INTO linked FROM beauty.services WHERE id=NEW.service_id AND professional_id=NEW.professional_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NEW.speciality_id IS NULL THEN NEW.speciality_id:=linked;
  ELSIF linked IS NOT NULL AND NEW.speciality_id<>linked THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
 END IF;
 IF NEW.speciality_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.professional_specialities ps JOIN beauty.specialities sp ON sp.id=ps.speciality_id WHERE ps.professional_id=NEW.professional_id AND ps.speciality_id=NEW.speciality_id AND sp.active AND sp.merged_into_id IS NULL) THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_content_speciality BEFORE INSERT OR UPDATE OF service_id,speciality_id ON beauty.posts FOR EACH ROW EXECUTE FUNCTION beauty.validate_content_speciality();
CREATE OR REPLACE VIEW beauty.public_posts WITH(security_barrier=true) AS
 SELECT post.id,post.title,post.body,post.kind,post.created_at,p.slug,p.business_name,coalesce(category.name,p.category) AS category,p.city,
 s.id AS service_id,s.name AS service_name,s.price_pence,asset.id AS asset_id,p.id AS professional_id,
 coalesce(post.speciality_id,s.speciality_id) AS speciality_id,sp.name AS speciality_name,sp.category_id
 FROM beauty.posts post JOIN beauty.professional_profiles p ON p.id=post.professional_id
 LEFT JOIN beauty.public_services s ON s.id=post.service_id AND s.professional_id=post.professional_id
 LEFT JOIN beauty.portfolio_assets asset ON asset.id=post.asset_id AND asset.professional_id=post.professional_id
 LEFT JOIN beauty.specialities sp ON sp.id=coalesce(post.speciality_id,s.speciality_id)
 LEFT JOIN beauty.platform_categories category ON category.id=sp.category_id
 WHERE post.speciality_id IS NULL OR sp.active;
CREATE FUNCTION beauty.save_my_portfolio_specialities(target_asset uuid,specialities uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pro uuid:=beauty.policy_actor_professional(); BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.portfolio_assets WHERE id=target_asset AND professional_id=pro) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF specialities IS NULL OR cardinality(specialities)>40 OR (SELECT count(DISTINCT x) FROM unnest(specialities) x)<>cardinality(specialities)
 OR EXISTS(SELECT 1 FROM unnest(specialities) x WHERE NOT EXISTS(SELECT 1 FROM beauty.professional_specialities ps JOIN beauty.specialities sp ON sp.id=ps.speciality_id WHERE ps.professional_id=pro AND ps.speciality_id=x AND sp.active AND sp.merged_into_id IS NULL)) THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
 DELETE FROM beauty.portfolio_specialities WHERE asset_id=target_asset AND NOT speciality_id=ANY(specialities);
 INSERT INTO beauty.portfolio_specialities SELECT target_asset,x FROM unnest(specialities) x ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION beauty.canonical_speciality(target uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH RECURSIVE chain AS(SELECT id,merged_into_id,0 AS depth FROM beauty.specialities WHERE id=target UNION ALL SELECT s.id,s.merged_into_id,c.depth+1 FROM beauty.specialities s JOIN chain c ON s.id=c.merged_into_id WHERE c.depth<20) SELECT id FROM chain ORDER BY depth DESC LIMIT 1;
$$;
CREATE FUNCTION beauty.catalog_review_service(target uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('serviceId',b.service_id,'serviceName',b.service_name,'specialityId',beauty.canonical_speciality((b.taxonomy_snapshot->>'specialityId')::uuid),'specialityName',b.taxonomy_snapshot->>'specialityName') FROM beauty.bookings b
 WHERE b.id=target AND b.status='completed' AND EXISTS(SELECT 1 FROM beauty.reviews r WHERE r.booking_id=b.id AND r.moderation_status='visible') AND EXISTS(SELECT 1 FROM beauty.public_professionals p WHERE p.id=b.professional_id);
$$;
CREATE OR REPLACE VIEW beauty.public_reviews WITH(security_barrier=true) AS
 SELECT id,beauty.catalog_completed_booking_professional(booking_id) AS professional_id,rating,body,public_name,created_at,
 (beauty.catalog_review_service(booking_id)->>'serviceId')::uuid AS service_id,
 beauty.catalog_review_service(booking_id)->>'serviceName' AS service_name,
 (beauty.catalog_review_service(booking_id)->>'specialityId')::uuid AS speciality_id,
 beauty.catalog_review_service(booking_id)->>'specialityName' AS speciality_name
 FROM beauty.reviews r WHERE beauty.catalog_completed_booking_professional(booking_id) IS NOT NULL;

-- Reference choices only: no professional is assigned a speciality by this seed.
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Braiding','braiding' FROM beauty.platform_categories WHERE taxonomy_key='hair';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'braids','speciality',id FROM beauty.specialities WHERE slug='braiding' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'braid stylist','speciality',id FROM beauty.specialities WHERE slug='braiding' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Knotless Braids','knotless-braids',180 FROM beauty.specialities WHERE slug='braiding';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'knotless braid','template',id FROM beauty.service_templates WHERE slug='knotless-braids' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'knotless','template',id FROM beauty.service_templates WHERE slug='knotless-braids' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'knotless braiding','template',id FROM beauty.service_templates WHERE slug='knotless-braids' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Cornrows','cornrows',90 FROM beauty.specialities WHERE slug='braiding';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'corn rows','template',id FROM beauty.service_templates WHERE slug='cornrows' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'cornrow','template',id FROM beauty.service_templates WHERE slug='cornrows' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'cainrows','template',id FROM beauty.service_templates WHERE slug='cornrows' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'canerows','template',id FROM beauty.service_templates WHERE slug='cornrows' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Box Braids','box-braids',180 FROM beauty.specialities WHERE slug='braiding';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'box braid','template',id FROM beauty.service_templates WHERE slug='box-braids' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Feed-in Braids','feed-in-braids',120 FROM beauty.specialities WHERE slug='braiding';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'feed in braids','template',id FROM beauty.service_templates WHERE slug='feed-in-braids' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Locs','locs' FROM beauty.platform_categories WHERE taxonomy_key='hair';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'locks','speciality',id FROM beauty.specialities WHERE slug='locs' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'dreadlocks','speciality',id FROM beauty.specialities WHERE slug='locs' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'dreads','speciality',id FROM beauty.specialities WHERE slug='locs' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Retwist','retwist',90 FROM beauty.specialities WHERE slug='locs';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'retwists','template',id FROM beauty.service_templates WHERE slug='retwist' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'loc retwist','template',id FROM beauty.service_templates WHERE slug='retwist' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'dread retwist','template',id FROM beauty.service_templates WHERE slug='retwist' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'retwst','template',id FROM beauty.service_templates WHERE slug='retwist' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Starter Locs','starter-locs',150 FROM beauty.specialities WHERE slug='locs';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'starter locks','template',id FROM beauty.service_templates WHERE slug='starter-locs' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'start locs','template',id FROM beauty.service_templates WHERE slug='starter-locs' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Interlocking','interlocking',120 FROM beauty.specialities WHERE slug='locs';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'interlock','template',id FROM beauty.service_templates WHERE slug='interlocking' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'loc interlocking','template',id FROM beauty.service_templates WHERE slug='interlocking' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Loc Maintenance','loc-maintenance',90 FROM beauty.specialities WHERE slug='locs';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'dreadlock maintenance','template',id FROM beauty.service_templates WHERE slug='loc-maintenance' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Wigs','wigs' FROM beauty.platform_categories WHERE taxonomy_key='hair';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Wig Install','wig-install',120 FROM beauty.specialities WHERE slug='wigs';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'wig installation','template',id FROM beauty.service_templates WHERE slug='wig-install' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'lace install','template',id FROM beauty.service_templates WHERE slug='wig-install' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Wig Customisation','wig-customisation',90 FROM beauty.specialities WHERE slug='wigs';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'wig customization','template',id FROM beauty.service_templates WHERE slug='wig-customisation' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Natural Hair','natural-hair' FROM beauty.platform_categories WHERE taxonomy_key='hair';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Wash & Blow Dry','wash-and-blow-dry',60 FROM beauty.specialities WHERE slug='natural-hair';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'wash blow dry','template',id FROM beauty.service_templates WHERE slug='wash-and-blow-dry' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Silk Press','silk-press',120 FROM beauty.specialities WHERE slug='natural-hair';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Natural Hair Twists','natural-hair-twist',90 FROM beauty.specialities WHERE slug='natural-hair';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'two strand twists','template',id FROM beauty.service_templates WHERE slug='natural-hair-twist' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Extensions','extensions' FROM beauty.platform_categories WHERE taxonomy_key='hair';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'hair extensions','speciality',id FROM beauty.specialities WHERE slug='extensions' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Tape Extensions','tape-extensions',120 FROM beauty.specialities WHERE slug='extensions';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'tape ins','template',id FROM beauty.service_templates WHERE slug='tape-extensions' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Sew-in Weave','sew-in-weave',150 FROM beauty.specialities WHERE slug='extensions';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'sew in','template',id FROM beauty.service_templates WHERE slug='sew-in-weave' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'weave install','template',id FROM beauty.service_templates WHERE slug='sew-in-weave' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Barbering','barbering' FROM beauty.platform_categories WHERE taxonomy_key='hair';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'barber','speciality',id FROM beauty.specialities WHERE slug='barbering' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'barbers','speciality',id FROM beauty.specialities WHERE slug='barbering' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Skin Fade','skin-fade',45 FROM beauty.specialities WHERE slug='barbering';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'fade haircut','template',id FROM beauty.service_templates WHERE slug='skin-fade' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Beard Trim','beard-trim',30 FROM beauty.specialities WHERE slug='barbering';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Haircut','mens-haircut',45 FROM beauty.specialities WHERE slug='barbering';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'mens cut','template',id FROM beauty.service_templates WHERE slug='mens-haircut' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'men haircut','template',id FROM beauty.service_templates WHERE slug='mens-haircut' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Gel Nails','gel-nails' FROM beauty.platform_categories WHERE taxonomy_key='nails';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Gel Polish','gel-polish',45 FROM beauty.specialities WHERE slug='gel-nails';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'gel manicure','template',id FROM beauty.service_templates WHERE slug='gel-polish' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'shellac','template',id FROM beauty.service_templates WHERE slug='gel-polish' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'BIAB','biab',75 FROM beauty.specialities WHERE slug='gel-nails';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'builder gel','template',id FROM beauty.service_templates WHERE slug='biab' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'builder in a bottle','template',id FROM beauty.service_templates WHERE slug='biab' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Nail Extensions','nail-extensions' FROM beauty.platform_categories WHERE taxonomy_key='nails';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Acrylic Extensions','acrylic-extensions',90 FROM beauty.specialities WHERE slug='nail-extensions';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'acrylic nails','template',id FROM beauty.service_templates WHERE slug='acrylic-extensions' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'acrylic set','template',id FROM beauty.service_templates WHERE slug='acrylic-extensions' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Gel Extensions','gel-extensions',90 FROM beauty.specialities WHERE slug='nail-extensions';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'gel x','template',id FROM beauty.service_templates WHERE slug='gel-extensions' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Nail Art','nail-art' FROM beauty.platform_categories WHERE taxonomy_key='nails';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Nail Art Design','nail-art-design',30 FROM beauty.specialities WHERE slug='nail-art';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Manicure & Pedicure','manicure-pedicure' FROM beauty.platform_categories WHERE taxonomy_key='nails';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Manicure','manicure',45 FROM beauty.specialities WHERE slug='manicure-pedicure';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Pedicure','pedicure',60 FROM beauty.specialities WHERE slug='manicure-pedicure';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Bridal Makeup','bridal-makeup' FROM beauty.platform_categories WHERE taxonomy_key='makeup';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Bridal Makeup','bridal-makeup-application',120 FROM beauty.specialities WHERE slug='bridal-makeup';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'wedding makeup','template',id FROM beauty.service_templates WHERE slug='bridal-makeup-application' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Bridal Trial','bridal-trial',90 FROM beauty.specialities WHERE slug='bridal-makeup';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Occasion Makeup','occasion-makeup' FROM beauty.platform_categories WHERE taxonomy_key='makeup';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Soft Glam','soft-glam',60 FROM beauty.specialities WHERE slug='occasion-makeup';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Full Glam','full-glam',90 FROM beauty.specialities WHERE slug='occasion-makeup';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Event Makeup','event-makeup',75 FROM beauty.specialities WHERE slug='occasion-makeup';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'party makeup','template',id FROM beauty.service_templates WHERE slug='event-makeup' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Facials','facials' FROM beauty.platform_categories WHERE taxonomy_key='skin';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Classic Facial','classic-facial',60 FROM beauty.specialities WHERE slug='facials';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'facial','template',id FROM beauty.service_templates WHERE slug='classic-facial' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Deep Cleansing Facial','deep-cleansing-facial',75 FROM beauty.specialities WHERE slug='facials';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Skin Consultation','skin-consultation' FROM beauty.platform_categories WHERE taxonomy_key='skin';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Skin Assessment','skin-assessment',30 FROM beauty.specialities WHERE slug='skin-consultation';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Lash Extensions','lash-extensions' FROM beauty.platform_categories WHERE taxonomy_key='lashes';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'eyelash extensions','speciality',id FROM beauty.specialities WHERE slug='lash-extensions' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Classic Lashes','classic-lashes',120 FROM beauty.specialities WHERE slug='lash-extensions';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Hybrid Lashes','hybrid-lashes',120 FROM beauty.specialities WHERE slug='lash-extensions';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Volume Lashes','volume-lashes',150 FROM beauty.specialities WHERE slug='lash-extensions';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'russian lashes','template',id FROM beauty.service_templates WHERE slug='volume-lashes' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Lash Lift','lash-lift' FROM beauty.platform_categories WHERE taxonomy_key='lashes';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Lash Lift & Tint','lash-lift-and-tint',60 FROM beauty.specialities WHERE slug='lash-lift';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'lash lift tint','template',id FROM beauty.service_templates WHERE slug='lash-lift-and-tint' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Brow Shaping','brow-shaping' FROM beauty.platform_categories WHERE taxonomy_key='brows';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Brow Threading','brow-threading',20 FROM beauty.specialities WHERE slug='brow-shaping';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'eyebrow threading','template',id FROM beauty.service_templates WHERE slug='brow-threading' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Brow Wax','brow-wax',20 FROM beauty.specialities WHERE slug='brow-shaping';
INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT 'eyebrow wax','template',id FROM beauty.service_templates WHERE slug='brow-wax' ON CONFLICT(normalised) DO NOTHING;
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Brow Lamination','brow-lamination' FROM beauty.platform_categories WHERE taxonomy_key='brows';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Brow Lamination','brow-lamination-treatment',60 FROM beauty.specialities WHERE slug='brow-lamination';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Waxing','waxing' FROM beauty.platform_categories WHERE taxonomy_key='hair-removal';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Leg Wax','leg-wax',45 FROM beauty.specialities WHERE slug='waxing';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Bikini Wax','bikini-wax',30 FROM beauty.specialities WHERE slug='waxing';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Underarm Wax','underarm-wax',20 FROM beauty.specialities WHERE slug='waxing';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Sugaring','sugaring' FROM beauty.platform_categories WHERE taxonomy_key='hair-removal';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Sugaring Treatment','sugaring-treatment',45 FROM beauty.specialities WHERE slug='sugaring';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Laser Hair Removal','laser-hair-removal' FROM beauty.platform_categories WHERE taxonomy_key='hair-removal';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Laser Consultation','laser-consultation',30 FROM beauty.specialities WHERE slug='laser-hair-removal';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Aesthetic Consultations','aesthetic-consultations' FROM beauty.platform_categories WHERE taxonomy_key='aesthetics';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Aesthetic Consultation','aesthetic-consultation',30 FROM beauty.specialities WHERE slug='aesthetic-consultations';
INSERT INTO beauty.specialities(category_id,name,slug) SELECT id,'Injectables','injectables' FROM beauty.platform_categories WHERE taxonomy_key='aesthetics';
INSERT INTO beauty.service_templates(speciality_id,name,slug,suggested_duration_minutes) SELECT id,'Injectables Consultation','injectables-consultation',30 FROM beauty.specialities WHERE slug='injectables';

CREATE FUNCTION beauty.resolve_treatment(search_term text) RETURNS TABLE(kind text,target_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT matches.kind,matches.id FROM (
 SELECT 'template'::text AS kind,t.id,1 AS priority FROM beauty.service_templates t JOIN beauty.specialities s ON s.id=t.speciality_id JOIN beauty.platform_categories c ON c.id=s.category_id WHERE t.active AND s.active AND c.active AND beauty.normalise_treatment(t.name)=beauty.normalise_treatment(search_term)
 UNION ALL SELECT 'speciality',s.id,2 FROM beauty.specialities s JOIN beauty.platform_categories c ON c.id=s.category_id WHERE s.active AND s.merged_into_id IS NULL AND c.active AND beauty.normalise_treatment(s.name)=beauty.normalise_treatment(search_term)
 UNION ALL SELECT 'category',c.id,3 FROM beauty.platform_categories c WHERE c.active AND NOT c.legacy_only AND beauty.normalise_treatment(c.name)=beauty.normalise_treatment(search_term)
 UNION ALL SELECT a.target_kind,a.target_id,CASE a.target_kind WHEN 'template' THEN 1 WHEN 'speciality' THEN 2 ELSE 3 END FROM beauty.treatment_aliases a WHERE a.normalised=beauty.normalise_treatment(search_term)
 ) matches ORDER BY priority,id LIMIT 1;
$$;
CREATE FUNCTION beauty.service_matches_treatment(service_id uuid,search_term text,category_filter uuid DEFAULT NULL,speciality_filter uuid DEFAULT NULL,template_filter uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM beauty.public_services svc LEFT JOIN LATERAL beauty.resolve_treatment(search_term) resolved ON true WHERE svc.id=service_id
 AND (category_filter IS NULL OR svc.category_id=category_filter)
 AND (speciality_filter IS NULL OR svc.speciality_id=speciality_filter)
 AND (template_filter IS NULL OR svc.template_id=template_filter)
 AND (beauty.normalise_treatment(search_term)='' OR
 CASE resolved.kind WHEN 'category' THEN svc.category_id=resolved.target_id WHEN 'speciality' THEN svc.speciality_id=resolved.target_id WHEN 'template' THEN svc.template_id=resolved.target_id OR EXISTS(SELECT 1 FROM beauty.service_templates t WHERE t.id=resolved.target_id AND (svc.speciality_id IS NULL OR svc.speciality_id=t.speciality_id) AND (beauty.normalise_treatment(t.name)=beauty.normalise_treatment(svc.name) OR EXISTS(SELECT 1 FROM beauty.treatment_aliases a WHERE a.target_kind='template' AND a.target_id=t.id AND a.normalised=beauty.normalise_treatment(svc.name))))
 ELSE to_tsvector('simple',svc.name) @@ plainto_tsquery('simple',search_term) END));
$$;
CREATE FUNCTION beauty.record_treatment_demand(search_term text,category_filter uuid DEFAULT NULL,speciality_filter uuid DEFAULT NULL,template_filter uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE kind text;target uuid; BEGIN
 IF template_filter IS NOT NULL THEN kind:='template';target:=template_filter;
 ELSIF speciality_filter IS NOT NULL THEN kind:='speciality';target:=speciality_filter;
 ELSIF category_filter IS NOT NULL THEN kind:='category';target:=category_filter;
 ELSE SELECT r.kind,r.target_id INTO kind,target FROM beauty.resolve_treatment(search_term) r; END IF;
 IF target IS NULL OR NOT ((kind='category' AND EXISTS(SELECT 1 FROM beauty.platform_categories WHERE id=target AND active)) OR (kind='speciality' AND EXISTS(SELECT 1 FROM beauty.specialities WHERE id=target AND active)) OR (kind='template' AND EXISTS(SELECT 1 FROM beauty.service_templates WHERE id=target AND active))) THEN RETURN; END IF;
 INSERT INTO beauty.taxonomy_demand_daily(day,target_kind,target_id) VALUES((now() AT TIME ZONE 'Europe/London')::date,kind,target) ON CONFLICT(day,target_kind,target_id) DO UPDATE SET hits=beauty.taxonomy_demand_daily.hits+1;
END $$;

-- Availability is shared by professional, across every category and service.
CREATE FUNCTION beauty.public_service_available_on(target_service uuid,target_day date) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE svc beauty.services;start_at timestamptz;finish_at timestamptz;minute integer;target_weekday integer; BEGIN
 IF target_day<(now() AT TIME ZONE 'Europe/London')::date OR target_day>(now() AT TIME ZONE 'Europe/London')::date+90 THEN RETURN false; END IF;
 SELECT s.* INTO svc FROM beauty.services s JOIN beauty.public_services pub ON pub.id=s.id WHERE s.id=target_service;
 IF svc.id IS NULL THEN RETURN false; END IF;
 svc.duration_minutes:=least(svc.duration_minutes,coalesce((SELECT min(duration_minutes) FROM beauty.service_options WHERE service_id=target_service AND active AND kind='variation'),svc.duration_minutes));
 target_weekday:=extract(dow FROM target_day)::integer;
 FOR minute IN SELECT generate_series(h.start_minute,h.end_minute-svc.duration_minutes,15) FROM beauty.public_hours h WHERE h.professional_id=svc.professional_id AND h.weekday=target_weekday LOOP
  start_at:=(target_day::timestamp+make_interval(mins=>minute)) AT TIME ZONE 'Europe/London';finish_at:=start_at+make_interval(mins=>svc.duration_minutes);
  IF start_at>=now()+interval '1 hour' AND NOT EXISTS(SELECT 1 FROM beauty.booking_busy(svc.professional_id,start_at,finish_at) b WHERE b.starts_at<finish_at AND b.ends_at>start_at) THEN RETURN true; END IF;
 END LOOP;RETURN false;
END $$;

CREATE FUNCTION beauty.require_taxonomy_admin() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id WHERE u.auth_id=beauty.auth_id() AND r.role='owner') THEN RETURN beauty.require_owner(); END IF;
 RETURN beauty.require_admin();
END $$;
REVOKE ALL ON FUNCTION beauty.require_taxonomy_admin() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.admin_taxonomy_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM beauty.require_taxonomy_admin();
 RETURN beauty.taxonomy_catalog(true)||jsonb_build_object(
 'categoryCoverage',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT c.id AS category_id,count(DISTINCT svc.id)::integer AS published_services,count(DISTINCT svc.professional_id)::integer AS professionals,coalesce((SELECT sum(d.hits) FROM beauty.taxonomy_demand_daily d WHERE d.day>=current_date-30 AND ((d.target_kind='category' AND d.target_id=c.id) OR (d.target_kind='speciality' AND d.target_id IN(SELECT id FROM beauty.specialities WHERE category_id=c.id)) OR (d.target_kind='template' AND d.target_id IN(SELECT t.id FROM beauty.service_templates t JOIN beauty.specialities sp ON sp.id=t.speciality_id WHERE sp.category_id=c.id)))),0)::integer AS searches FROM beauty.platform_categories c LEFT JOIN beauty.public_services svc ON svc.category_id=c.id WHERE NOT c.legacy_only GROUP BY c.id) x),'[]'),
 'coverage',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT sp.id AS speciality_id,count(DISTINCT s.id) FILTER(WHERE s.active AND s.publication_status='published' AND s.categorisation_status='approved' AND EXISTS(SELECT 1 FROM beauty.public_professionals p WHERE p.id=s.professional_id))::integer AS published_services,count(DISTINCT s.professional_id) FILTER(WHERE s.active AND s.publication_status='published' AND s.categorisation_status='approved' AND EXISTS(SELECT 1 FROM beauty.public_professionals p WHERE p.id=s.professional_id))::integer AS professionals,coalesce((SELECT sum(hits) FROM beauty.taxonomy_demand_daily d WHERE d.day>=current_date-30 AND (d.target_kind='speciality' AND d.target_id=sp.id OR d.target_kind='template' AND d.target_id IN(SELECT id FROM beauty.service_templates WHERE speciality_id=sp.id))),0)::integer AS searches FROM beauty.specialities sp LEFT JOIN beauty.services s ON s.speciality_id=sp.id GROUP BY sp.id) x),'[]'),
 'services',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT s.id,s.name,s.category_id,s.speciality_id,s.categorisation_status,s.categorisation_reason,p.business_name FROM beauty.services s JOIN beauty.professional_profiles p ON p.id=s.professional_id ORDER BY (s.categorisation_status='needs_review') DESC,s.created_at DESC LIMIT 200) x),'[]'));
END $$;
CREATE FUNCTION beauty.admin_update_taxonomy(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_taxonomy_admin();op text:=input->>'operation';target uuid;source uuid;destination_category uuid;spec uuid;pro uuid;alias text;old_spec beauty.specialities;primary_pros uuid[]; BEGIN
 IF jsonb_typeof(input)<>'object' OR length(trim(coalesce(input->>'reason',''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 -- Serialise definition edits; lock affected professional calendars in the same
 -- order as policy changes and reservations before moving any service.
 PERFORM pg_advisory_xact_lock(hashtextextended('taxonomy:admin',0));
 FOR pro IN SELECT id FROM beauty.professional_profiles ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('policies:'||pro::text,0));PERFORM pg_advisory_xact_lock(hashtextextended(pro::text,0));
 END LOOP;
 IF op IN('category','speciality','template') THEN
  target:=coalesce((input->>'id')::uuid,gen_random_uuid());
  IF jsonb_typeof(input->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(input->'sortOrder') IS DISTINCT FROM 'number' OR (input->>'sortOrder')::integer NOT BETWEEN 0 AND 10000 OR jsonb_typeof(input->'aliases') IS DISTINCT FROM 'array' OR jsonb_array_length(input->'aliases')>40 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  IF op='category' THEN
   INSERT INTO beauty.platform_categories(id,name,slug,description,image_url,active,sort_order) VALUES(target,trim(input->>'name'),input->>'slug',input->>'description',nullif(input->>'imageUrl',''),(input->>'active')::boolean,(input->>'sortOrder')::integer)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,description=excluded.description,image_url=excluded.image_url,active=excluded.active,sort_order=excluded.sort_order;
   UPDATE beauty.services SET category=input->>'name',active=active AND (input->>'active')::boolean,publication_status=CASE WHEN (input->>'active')::boolean THEN publication_status ELSE 'inactive' END WHERE category_id=target;
  ELSIF op='speciality' THEN
   destination_category:=(input->>'categoryId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM beauty.platform_categories WHERE id=destination_category AND NOT legacy_only) THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
   SELECT * INTO old_spec FROM beauty.specialities WHERE id=target;
   IF old_spec.merged_into_id IS NOT NULL THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
   INSERT INTO beauty.specialities(id,category_id,name,slug,description,active,sort_order) VALUES(target,destination_category,trim(input->>'name'),input->>'slug',input->>'description',(input->>'active')::boolean,(input->>'sortOrder')::integer)
   ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,slug=excluded.slug,description=excluded.description,active=excluded.active,sort_order=excluded.sort_order,updated_at=now();
   INSERT INTO beauty.professional_categories SELECT professional_id,destination_category FROM beauty.professional_specialities WHERE speciality_id=target ON CONFLICT DO NOTHING;
   -- Pausing an outdated definition retains all service and booking records.
   UPDATE beauty.services SET category_id=destination_category,category=(SELECT name FROM beauty.platform_categories WHERE id=destination_category),active=active AND (input->>'active')::boolean,publication_status=CASE WHEN (input->>'active')::boolean THEN publication_status ELSE 'inactive' END WHERE speciality_id=target;
  ELSE
   spec:=(input->>'specialityId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM beauty.specialities WHERE id=spec AND merged_into_id IS NULL) OR EXISTS(SELECT 1 FROM beauty.service_templates WHERE id=target AND speciality_id<>spec AND EXISTS(SELECT 1 FROM beauty.services WHERE template_id=target)) THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
   INSERT INTO beauty.service_templates(id,speciality_id,name,slug,description,active,sort_order,suggested_duration_minutes) VALUES(target,spec,trim(input->>'name'),input->>'slug',input->>'description',(input->>'active')::boolean,(input->>'sortOrder')::integer,(input->>'suggestedDurationMinutes')::integer)
   ON CONFLICT(id) DO UPDATE SET speciality_id=excluded.speciality_id,name=excluded.name,slug=excluded.slug,description=excluded.description,active=excluded.active,sort_order=excluded.sort_order,suggested_duration_minutes=excluded.suggested_duration_minutes,updated_at=now();
  END IF;
  DELETE FROM beauty.treatment_aliases WHERE target_kind=op AND target_id=target;
  FOR alias IN SELECT value FROM jsonb_array_elements_text(input->'aliases') LOOP
   IF beauty.normalise_treatment(alias)='' OR EXISTS(SELECT 1 FROM beauty.treatment_aliases WHERE normalised=beauty.normalise_treatment(alias) AND (target_kind<>op OR target_id<>target))
   OR EXISTS(SELECT 1 FROM beauty.service_templates t WHERE t.active AND beauty.normalise_treatment(t.name)=beauty.normalise_treatment(alias) AND (op<>'template' OR t.id<>target))
   OR EXISTS(SELECT 1 FROM beauty.specialities sp WHERE sp.active AND beauty.normalise_treatment(sp.name)=beauty.normalise_treatment(alias) AND (op<>'speciality' OR sp.id<>target))
   OR EXISTS(SELECT 1 FROM beauty.platform_categories c WHERE c.active AND NOT c.legacy_only AND beauty.normalise_treatment(c.name)=beauty.normalise_treatment(alias) AND (op<>'category' OR c.id<>target)) THEN RAISE EXCEPTION 'ALIAS_ALREADY_USED' USING ERRCODE='22023'; END IF;
   INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) VALUES(trim(alias),op,target) ON CONFLICT(normalised) DO NOTHING;
  END LOOP;
 ELSIF op='merge' THEN
  source:=(input->>'sourceId')::uuid;target:=(input->>'targetId')::uuid;
  SELECT category_id INTO destination_category FROM beauty.specialities WHERE id=target AND active AND merged_into_id IS NULL;
  IF destination_category IS NULL OR source=target OR NOT EXISTS(SELECT 1 FROM beauty.specialities WHERE id=source AND merged_into_id IS NULL) THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(professional_id),'{}') INTO primary_pros FROM beauty.professional_specialities WHERE speciality_id=source AND is_primary;
  UPDATE beauty.professional_specialities SET is_primary=false WHERE speciality_id=source;
  INSERT INTO beauty.professional_specialities(professional_id,speciality_id) SELECT professional_id,target FROM beauty.professional_specialities WHERE speciality_id=source ON CONFLICT DO NOTHING;
  UPDATE beauty.professional_specialities SET is_primary=true WHERE speciality_id=target AND professional_id=ANY(primary_pros);
  INSERT INTO beauty.professional_categories SELECT professional_id,destination_category FROM beauty.professional_specialities WHERE speciality_id=target ON CONFLICT DO NOTHING;
  UPDATE beauty.service_templates SET speciality_id=target WHERE speciality_id=source;
  UPDATE beauty.services SET speciality_id=target,category_id=destination_category,category=(SELECT name FROM beauty.platform_categories WHERE id=destination_category) WHERE speciality_id=source;
  UPDATE beauty.posts SET speciality_id=target WHERE speciality_id=source;
  INSERT INTO beauty.portfolio_specialities SELECT asset_id,target FROM beauty.portfolio_specialities WHERE speciality_id=source ON CONFLICT DO NOTHING;
  DELETE FROM beauty.portfolio_specialities WHERE speciality_id=source;
  DELETE FROM beauty.professional_specialities WHERE speciality_id=source;
  UPDATE beauty.treatment_aliases SET target_id=target WHERE target_kind='speciality' AND target_id=source;
  INSERT INTO beauty.treatment_aliases(term,target_kind,target_id) SELECT name,'speciality',target FROM beauty.specialities WHERE id=source ON CONFLICT(normalised) DO NOTHING;
  UPDATE beauty.specialities SET active=false,merged_into_id=target,updated_at=now() WHERE id=source;
 ELSIF op='review' THEN
  target:=(input->>'serviceId')::uuid;
  IF input->>'status' NOT IN('approved','needs_review','blocked') THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  UPDATE beauty.services SET categorisation_status=input->>'status',categorisation_reason=trim(input->>'reason') WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 PERFORM beauty.write_admin_audit(actor,CASE WHEN EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=actor AND role='owner') THEN 'owner' ELSE 'admin' END,'taxonomy.'||op,actor,'taxonomy',target,input->>'reason',input);
 RETURN target;
END $$;

-- Only deliberately exposed entry points can be invoked by the application.
DO $$ DECLARE fn record; BEGIN
 FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname=ANY(ARRAY['normalise_treatment','taxonomy_catalog','my_speciality_selection','save_my_specialities','validate_service_taxonomy','save_my_service_options','service_quote_row','service_quote','request_service_quote_row','request_service_quote','snapshot_booked_service','protect_service_booking_snapshot','validate_content_speciality','save_my_portfolio_specialities','canonical_speciality','catalog_review_service','resolve_treatment','service_matches_treatment','record_treatment_demand','public_service_available_on','admin_taxonomy_overview','admin_update_taxonomy']) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,beauty_app',fn.signature);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION beauty.public_service_policy(uuid,uuid,uuid[]),beauty.reserve_booking(uuid,timestamptz,text,boolean,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.normalise_treatment(text),beauty.resolve_treatment(text),beauty.service_matches_treatment(uuid,text,uuid,uuid,uuid),beauty.public_service_available_on(uuid,date) TO beauty_app,beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.canonical_speciality(uuid),beauty.catalog_review_service(uuid) TO beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.taxonomy_catalog(boolean),beauty.my_speciality_selection(),beauty.save_my_specialities(uuid[],uuid[],uuid),beauty.save_my_service_options(uuid,jsonb,jsonb),beauty.service_quote(uuid,uuid,uuid[]),beauty.public_service_policy(uuid,uuid,uuid[]),beauty.reserve_booking(uuid,timestamptz,text,boolean,uuid,uuid[]),beauty.save_my_portfolio_specialities(uuid,uuid[]),beauty.record_treatment_demand(text,uuid,uuid,uuid),beauty.admin_taxonomy_overview(),beauty.admin_update_taxonomy(jsonb) TO beauty_app;

GRANT EXECUTE ON FUNCTION beauty.request_service_quote_row(uuid) TO beauty_booking_ops;
GRANT EXECUTE ON FUNCTION beauty.request_service_quote(uuid) TO beauty_booking_ops;

CREATE FUNCTION beauty.owner_set_homepage_categories(images jsonb,names jsonb,metadata jsonb,change_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;device text;item record;config jsonb;cat uuid;spec uuid;tpl uuid;allowed text[];setting record; BEGIN
 PERFORM beauty.require_owner();SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id();
 IF length(trim(coalesce(change_reason,''))) NOT BETWEEN 5 AND 500 OR jsonb_typeof(images) IS DISTINCT FROM 'object' OR jsonb_typeof(names) IS DISTINCT FROM 'object' OR jsonb_typeof(metadata) IS DISTINCT FROM 'object' OR NOT images?&ARRAY['desktop','mobile'] OR NOT names?&ARRAY['desktop','mobile'] OR NOT metadata?&ARRAY['desktop','mobile'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(images||names||metadata) k WHERE k NOT IN('desktop','mobile')) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 FOREACH device IN ARRAY ARRAY['desktop','mobile'] LOOP
  allowed:=CASE WHEN device='desktop' THEN ARRAY['hair','nails','barber','waxing','injectables'] ELSE ARRAY['hair','nails','lashes','skin','makeup'] END;
  IF jsonb_typeof(images->device) IS DISTINCT FROM 'object' OR jsonb_typeof(names->device) IS DISTINCT FROM 'object' OR jsonb_typeof(metadata->device) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys((images->device)||(names->device)||(metadata->device)))>30 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT key,value FROM jsonb_each((images->device)||(names->device)||(metadata->device)) LOOP
   IF NOT item.key=ANY(allowed) AND (item.key!~'^[a-f0-9-]{36}$' OR NOT (metadata->device)?item.key) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR item IN SELECT key,value FROM jsonb_each(images->device) LOOP
   IF jsonb_typeof(item.value) NOT IN('string','null') OR (jsonb_typeof(item.value)='string' AND (length(item.value#>>'{}')>2048 OR (item.value#>>'{}')!~'^https://[^[:space:]]+$')) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR item IN SELECT key,value FROM jsonb_each(names->device) LOOP
   IF jsonb_typeof(item.value) NOT IN('string','null') OR (jsonb_typeof(item.value)='string' AND length(trim(item.value#>>'{}')) NOT BETWEEN 2 AND 60) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR item IN SELECT key,value FROM jsonb_each(metadata->device) LOOP
   config:=item.value;cat:=(config->>'categoryId')::uuid;spec:=(config->>'specialityId')::uuid;tpl:=(config->>'templateId')::uuid;
   IF jsonb_typeof(config) IS DISTINCT FROM 'object' OR jsonb_typeof(config->'visible') IS DISTINCT FROM 'boolean' OR jsonb_typeof(config->'sortOrder') IS DISTINCT FROM 'number' OR (config->>'sortOrder')::integer NOT BETWEEN 0 AND 10000 OR length(coalesce(config->>'description',''))>200
   OR (cat IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.platform_categories WHERE id=cat AND active AND NOT legacy_only))
   OR (spec IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.specialities WHERE id=spec AND category_id=cat AND active AND merged_into_id IS NULL))
   OR (tpl IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.service_templates WHERE id=tpl AND speciality_id=spec AND active))
   OR (NOT item.key=ANY(allowed) AND (cat IS NULL OR coalesce(names->device->>item.key,'')='')) THEN RAISE EXCEPTION 'INVALID_TAXONOMY' USING ERRCODE='22023'; END IF;
  END LOOP;
 END LOOP;
 FOR setting IN SELECT * FROM(VALUES('homepage_category_media',images),('homepage_category_names',names),('homepage_category_metadata',metadata)) vals(key,value) LOOP
  INSERT INTO beauty.platform_settings(key,value,updated_at,updated_by) VALUES(setting.key,setting.value,now(),actor) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 END LOOP;
 PERFORM beauty.write_admin_audit(actor,'owner','homepage_categories_updated',actor,'platform_setting',NULL,change_reason,jsonb_build_object('images',images,'names',names,'metadata',metadata));
 RETURN images;
END $$;
CREATE OR REPLACE FUNCTION beauty.public_homepage_media() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('desktopHero',(SELECT value->'desktopHero' FROM beauty.platform_settings WHERE key='homepage_media'),'mobileHero',(SELECT value->'mobileHero' FROM beauty.platform_settings WHERE key='homepage_media'),
 'categoryImages',coalesce((SELECT value FROM beauty.platform_settings WHERE key='homepage_category_media'),'{}'),
 'categoryNames',coalesce((SELECT value FROM beauty.platform_settings WHERE key='homepage_category_names'),'{}'),
 'categoryMetadata',coalesce((SELECT value FROM beauty.platform_settings WHERE key='homepage_category_metadata'),'{}'));
$$;
REVOKE ALL ON FUNCTION beauty.owner_set_homepage_categories(jsonb,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_set_homepage_categories(jsonb,jsonb,jsonb,text) TO beauty_app;

GRANT SELECT ON beauty.public_media_assets TO beauty_catalog;
GRANT EXECUTE ON FUNCTION beauty.canonical_speciality(uuid),beauty.catalog_review_service(uuid) TO beauty_app;
-- Direct table writes obey the same speciality ownership as the tagging RPC.
ALTER POLICY portfolio_specialities_owner ON beauty.portfolio_specialities WITH CHECK(EXISTS(SELECT 1 FROM beauty.portfolio_assets a JOIN beauty.professional_specialities ps ON ps.professional_id=a.professional_id JOIN beauty.specialities sp ON sp.id=ps.speciality_id WHERE a.id=asset_id AND ps.speciality_id=portfolio_specialities.speciality_id AND sp.active AND sp.merged_into_id IS NULL));

CREATE OR REPLACE VIEW beauty.public_portfolio_specialities WITH(security_barrier=true) AS
 SELECT link.asset_id,link.speciality_id,sp.name AS speciality_name FROM beauty.portfolio_specialities link JOIN beauty.specialities sp ON sp.id=link.speciality_id WHERE sp.active
 UNION SELECT svc.asset_id,svc.speciality_id,svc.speciality_name FROM beauty.public_services svc WHERE svc.asset_id IS NOT NULL AND svc.speciality_id IS NOT NULL;

CREATE INDEX services_speciality_history_idx ON beauty.services(speciality_id,id) WHERE speciality_id IS NOT NULL;
CREATE INDEX services_template_history_idx ON beauty.services(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX posts_speciality_history_idx ON beauty.posts(speciality_id) WHERE speciality_id IS NOT NULL;
CREATE FUNCTION beauty.valid_service_option_attributes(attributes jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN jsonb_typeof(attributes)='object' THEN (SELECT count(*)<=6 AND coalesce(bool_and(length(key) BETWEEN 1 AND 40 AND jsonb_typeof(value)='string' AND length(value#>>'{}')<=100),true) FROM jsonb_each(attributes)) ELSE false END;
$$;
ALTER TABLE beauty.service_options ADD CONSTRAINT service_options_attributes_valid CHECK(beauty.valid_service_option_attributes(attributes));
REVOKE ALL ON FUNCTION beauty.valid_service_option_attributes(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.valid_service_option_attributes(jsonb) TO beauty_app;

-- Reuse the platform catalogue. Product visibility is independent of service
-- visibility; hiding a category never deletes a product, order or booking.
ALTER TABLE beauty.platform_categories ADD COLUMN product_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE beauty.platform_categories ADD COLUMN product_sort_order integer NOT NULL DEFAULT 100 CHECK(product_sort_order BETWEEN 0 AND 10000);
UPDATE beauty.platform_categories SET product_enabled=true,product_sort_order=sort_order WHERE slug IN('hair','nails','makeup','skin','barbering','lashes','brows') AND NOT legacy_only;
INSERT INTO beauty.platform_categories(name,slug,active,product_enabled,product_sort_order)
VALUES('Tools','tools',false,true,80),('Fragrance','fragrance',false,true,90)
ON CONFLICT(slug) DO UPDATE SET product_enabled=true;
ALTER TABLE beauty.products ADD COLUMN category_id uuid REFERENCES beauty.platform_categories(id);
CREATE INDEX products_category_idx ON beauty.products(category_id) WHERE category_id IS NOT NULL;
GRANT INSERT(category_id),UPDATE(category_id) ON beauty.products TO beauty_app;

CREATE FUNCTION beauty.validate_product_category() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.category_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id)
 AND NOT EXISTS(SELECT 1 FROM beauty.platform_categories WHERE id=NEW.category_id AND product_enabled AND NOT legacy_only) THEN
  RAISE EXCEPTION 'INVALID_PRODUCT_CATEGORY' USING ERRCODE='22023';
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.validate_product_category() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_product_category BEFORE INSERT OR UPDATE OF category_id ON beauty.products FOR EACH ROW EXECUTE FUNCTION beauty.validate_product_category();
-- Preserve the inspected production view, including all account-visibility and
-- moderation gates, owners and grants. Append the new public field only.
DO $$ DECLARE definition text; BEGIN
 definition:=rtrim(trim(pg_get_viewdef('beauty.public_products'::regclass,true)),';');
 IF strpos(definition,'professional_is_public')=0 THEN RAISE EXCEPTION 'PRODUCT_VIEW_REVIEW_REQUIRED'; END IF;
 EXECUTE format('CREATE OR REPLACE VIEW beauty.public_products WITH(security_barrier=true) AS SELECT entry.*,product.category_id FROM (%s) entry JOIN beauty.products product ON product.id=entry.id',definition);
END $$;

CREATE FUNCTION beauty.admin_upsert_product_category(target uuid,new_name text,new_slug text,next_active boolean,next_sort_order integer,decision_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=beauty.require_taxonomy_admin(); result uuid; BEGIN
 IF char_length(trim(coalesce(new_name,''))) NOT BETWEEN 2 AND 60 OR new_slug IS NULL OR new_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
 OR next_active IS NULL OR next_sort_order IS NULL OR next_sort_order NOT BETWEEN 0 AND 10000 OR char_length(trim(coalesce(decision_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 IF target IS NULL THEN
  -- An existing shared name can be enabled for products without duplicating it.
  SELECT id INTO result FROM beauty.platform_categories WHERE slug=new_slug AND NOT legacy_only FOR UPDATE;
  IF result IS NULL THEN
   INSERT INTO beauty.platform_categories(name,slug,active,product_enabled,product_sort_order) VALUES(trim(new_name),new_slug,false,next_active,next_sort_order) RETURNING id INTO result;
  ELSE
   UPDATE beauty.platform_categories SET product_enabled=next_active,product_sort_order=next_sort_order,updated_at=now() WHERE id=result;
  END IF;
 ELSE
  UPDATE beauty.platform_categories SET name=trim(new_name),slug=new_slug,product_enabled=next_active,product_sort_order=next_sort_order,updated_at=now() WHERE id=target AND NOT legacy_only RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM beauty.write_admin_audit(actor,CASE WHEN EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=actor AND role='owner') THEN 'owner' ELSE 'admin' END,'product_category.updated',actor,'category',result,decision_reason,jsonb_build_object('name',new_name,'visible',next_active));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION beauty.admin_upsert_product_category(uuid,text,text,boolean,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.admin_upsert_product_category(uuid,text,text,boolean,integer,text) TO beauty_app;

-- Availability hint only. Reuses the shared hours and authoritative busy
-- intervals; actual reservations continue through the existing booking writer.
CREATE FUNCTION beauty.public_next_service_slot(target_service uuid,start_day date) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE svc beauty.services; day date; candidate timestamptz; finish_at timestamptz; h record; local_end timestamp; duration integer; BEGIN
 IF start_day IS NULL OR start_day<(now() AT TIME ZONE 'Europe/London')::date OR start_day>(now() AT TIME ZONE 'Europe/London')::date+90 THEN RETURN NULL; END IF;
 SELECT s.* INTO svc FROM beauty.services s JOIN beauty.public_services p ON p.id=s.id WHERE s.id=target_service;
 IF svc.id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM beauty.public_hours WHERE professional_id=svc.professional_id) THEN RETURN NULL; END IF;
 duration:=least(svc.duration_minutes,coalesce((SELECT min(duration_minutes) FROM beauty.service_options WHERE service_id=svc.id AND kind='variation' AND active),svc.duration_minutes));
 FOR day IN SELECT start_day+i FROM generate_series(0,13) i LOOP
  IF day>(now() AT TIME ZONE 'Europe/London')::date+90 THEN EXIT; END IF;
  FOR h IN SELECT * FROM beauty.public_hours WHERE professional_id=svc.professional_id AND weekday=extract(dow FROM day)::integer LOOP
   FOR candidate IN SELECT g FROM generate_series(day::timestamp AT TIME ZONE 'Europe/London',(day+1)::timestamp AT TIME ZONE 'Europe/London'-interval '15 minutes',interval '15 minutes') g
    WHERE g>=now()+interval '1 hour' AND extract(hour FROM g AT TIME ZONE 'Europe/London')*60+extract(minute FROM g AT TIME ZONE 'Europe/London')>=h.start_minute LOOP
    finish_at:=candidate+make_interval(mins=>duration);local_end:=finish_at AT TIME ZONE 'Europe/London';
    IF (local_end::date=day AND extract(hour FROM local_end)*60+extract(minute FROM local_end)<=h.end_minute OR local_end=(day+1)::timestamp AND h.end_minute=1440)
     AND NOT EXISTS(SELECT 1 FROM beauty.booking_busy(svc.professional_id,candidate,finish_at) b WHERE b.starts_at<finish_at AND b.ends_at>candidate) THEN RETURN candidate; END IF;
   END LOOP;
  END LOOP;
 END LOOP; RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION beauty.public_next_service_slot(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.public_next_service_slot(uuid,date) TO beauty_app,beauty_catalog;

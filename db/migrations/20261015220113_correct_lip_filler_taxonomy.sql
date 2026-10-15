-- Owner-authorised catalogue correction: a treatment belongs below a broad
-- category. Retain the old category row and never infer professional skills.
DO $$
DECLARE
  aesthetics uuid;
  injectables uuid;
  legacy_category uuid;
  treatment uuid;
  alias_term text;
  owner_user uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('taxonomy:admin',0));
  SELECT id INTO aesthetics FROM beauty.platform_categories
    WHERE taxonomy_key='aesthetics' AND active AND NOT legacy_only;
  SELECT id INTO injectables FROM beauty.specialities
    WHERE slug='injectables' AND category_id=aesthetics
      AND active AND merged_into_id IS NULL;
  IF aesthetics IS NULL OR injectables IS NULL THEN
    RAISE EXCEPTION 'AESTHETICS_TAXONOMY_REVIEW_REQUIRED';
  END IF;

  SELECT id INTO legacy_category FROM beauty.platform_categories
    WHERE lower(name)='lip filler' FOR UPDATE;
  IF legacy_category IS NOT NULL THEN
    -- Production preflight found no related services, profiles or selections.
    -- Stop if that changes, rather than silently hiding or reclassifying work.
    IF EXISTS(SELECT 1 FROM beauty.services WHERE category_id=legacy_category OR lower(category)='lip filler')
       OR EXISTS(SELECT 1 FROM beauty.professional_categories WHERE category_id=legacy_category)
       OR EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE lower(category)='lip filler')
       OR EXISTS(SELECT 1 FROM beauty.specialities WHERE category_id=legacy_category) THEN
      RAISE EXCEPTION 'LEGACY_LIP_FILLER_REFERENCES_REQUIRE_REVIEW';
    END IF;
    UPDATE beauty.platform_categories
      SET active=false,legacy_only=true,canonical_category_id=aesthetics,updated_at=now()
      WHERE id=legacy_category;
  END IF;

  INSERT INTO beauty.service_templates(speciality_id,name,slug,description)
    VALUES(injectables,'Lip Filler','lip-filler','Lip filler treatment. Professionals must meet applicable qualification and suitability requirements.')
    ON CONFLICT(slug) DO NOTHING;
  SELECT id INTO treatment FROM beauty.service_templates
    WHERE slug='lip-filler' AND speciality_id=injectables AND active;
  IF treatment IS NULL THEN RAISE EXCEPTION 'LIP_FILLER_TEMPLATE_REVIEW_REQUIRED'; END IF;

  FOREACH alias_term IN ARRAY ARRAY['lip filler','lip fillers','lipfiller','lip augmentation'] LOOP
    IF EXISTS(SELECT 1 FROM beauty.treatment_aliases
      WHERE normalised=beauty.normalise_treatment(alias_term)
        AND (target_kind<>'template' OR target_id<>treatment)) THEN
      RAISE EXCEPTION 'LIP_FILLER_ALIAS_REVIEW_REQUIRED';
    END IF;
    INSERT INTO beauty.treatment_aliases(term,target_kind,target_id)
      VALUES(alias_term,'template',treatment) ON CONFLICT(normalised) DO NOTHING;
  END LOOP;
  SELECT u.id INTO owner_user FROM beauty.users u JOIN beauty.user_roles r ON r.user_id=u.id
    WHERE r.role='owner' AND u.status='active' AND u.deleted_at IS NULL ORDER BY u.id LIMIT 1;
  IF owner_user IS NOT NULL THEN
    INSERT INTO beauty.admin_audit_logs(actor_reference,actor_user_id,actor_role,action,target_user_id,target_type,target_id,reason,metadata)
      VALUES('Owner-authorised catalogue maintenance',owner_user,'owner','taxonomy.treatment.reclassified',owner_user,'taxonomy',treatment,
      'Place Lip Filler under Aesthetics / Injectables instead of a top-level category',
      jsonb_build_object('legacy_category_id',legacy_category,'category_id',aesthetics,'speciality_id',injectables,'service_template_id',treatment,'existing_records_preserved',true));
  END IF;
END $$;

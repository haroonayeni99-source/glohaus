-- Read-only snapshot of production functions, 2026-10-10.
-- Test fixture only: never a migration or production write.
CREATE OR REPLACE FUNCTION beauty.owner_create_feature_request(target_audience text, target_title text, target_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE actor uuid; new_id uuid;
BEGIN
  PERFORM beauty.require_owner();
  IF target_audience NOT IN('customer','professional','all') THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id();
  INSERT INTO beauty.feature_requests(audience,title,description,created_by)
  VALUES(target_audience,trim(target_title),trim(target_description),actor)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION beauty.owner_launch_marketing_preset(target_preset text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE actor uuid;
DECLARE campaign_id uuid;
DECLARE target_audience text;
DECLARE pref_column text;
DECLARE campaign_name text;
DECLARE campaign_subject text;
DECLARE campaign_body text;
DECLARE campaign_cta text;
DECLARE inserted_count integer := 0;
BEGIN
  PERFORM beauty.require_owner();
  SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id();

  CASE target_preset
    WHEN 'last_minute_availability' THEN
      target_audience := 'customer'; pref_column := 'availability';
      campaign_name := 'Last-minute availability';
      campaign_subject := 'Last-minute beauty appointments on GLOHAUS';
      campaign_body := 'Fresh appointment slots are available on GLOHAUS. Browse relevant professionals and book through GLOHAUS while availability lasts.';
      campaign_cta := '/explore';
    WHEN 'new_professionals' THEN
      target_audience := 'customer'; pref_column := 'new_professionals';
      campaign_name := 'New professionals near you';
      campaign_subject := 'Discover new beauty professionals on GLOHAUS';
      campaign_body := 'New beauty professionals and services are joining GLOHAUS. Explore the latest options and book securely through the marketplace.';
      campaign_cta := '/explore';
    WHEN 'followed_updates' THEN
      target_audience := 'customer'; pref_column := 'discover';
      campaign_name := 'New services from followed professionals';
      campaign_subject := 'New work and services from GLOHAUS professionals';
      campaign_body := 'See new work, services and inspiration from professionals on GLOHAUS, then book directly from their profile.';
      campaign_cta := '/discover';
    WHEN 'saved_availability' THEN
      target_audience := 'customer'; pref_column := 'availability';
      campaign_name := 'Saved professionals availability';
      campaign_subject := 'Professionals you like may have new availability';
      campaign_body := 'Check current availability from professionals and looks you have saved on GLOHAUS.';
      campaign_cta := '/account/saved';
    WHEN 'discover_weekly' THEN
      target_audience := 'customer'; pref_column := 'discover';
      campaign_name := 'Discover weekly';
      campaign_subject := 'Fresh beauty inspiration on GLOHAUS';
      campaign_body := 'Explore new looks, tutorials and professional work in Discover. If you love a look, book the professional behind it through GLOHAUS.';
      campaign_cta := '/discover';
    WHEN 'shop_recommendations' THEN
      target_audience := 'customer'; pref_column := 'shop';
      campaign_name := 'Shop recommendations';
      campaign_subject := 'New beauty products on GLOHAUS';
      campaign_body := 'Browse products from GLOHAUS professionals and sellers you can discover through the marketplace.';
      campaign_cta := '/shop';
    WHEN 'rebooking' THEN
      target_audience := 'customer'; pref_column := 'rebooking';
      campaign_name := 'Rebooking reminder';
      campaign_subject := 'Ready for your next GLOHAUS appointment?';
      campaign_body := 'It may be time for your next beauty appointment. Revisit your booking history or explore current availability on GLOHAUS.';
      campaign_cta := '/account/bookings?view=history';
    WHEN 'customer_referral' THEN
      target_audience := 'customer'; pref_column := 'customer_offers';
      campaign_name := 'Customer referral';
      campaign_subject := 'Invite someone to discover GLOHAUS';
      campaign_body := 'Share GLOHAUS with someone who would love easier beauty discovery and bookings. Any future reward remains subject to the live GLOHAUS referral terms.';
      campaign_cta := '/';
    WHEN 'professional_growth' THEN
      target_audience := 'professional'; pref_column := 'professional_growth';
      campaign_name := 'Professional growth tips';
      campaign_subject := 'Grow your GLOHAUS presence';
      campaign_body := 'Refresh your profile, publish your work to Discover and keep availability up to date to help customers find and book you.';
      campaign_cta := '/professional';
    WHEN 'professional_features' THEN
      target_audience := 'professional'; pref_column := 'marketplace_features';
      campaign_name := 'Professional feature update';
      campaign_subject := 'New GLOHAUS professional tools';
      campaign_body := 'See the latest GLOHAUS tools for managing bookings, content, products and your professional business.';
      campaign_cta := '/professional/tools';
    WHEN 'professional_referrals' THEN
      target_audience := 'professional'; pref_column := 'professional_promotions';
      campaign_name := 'Professional referral opportunities';
      campaign_subject := 'Grow the GLOHAUS professional community';
      campaign_body := 'See current GLOHAUS referral opportunities and invite eligible beauty professionals through your professional tools.';
      campaign_cta := '/professional/referrals';
    WHEN 'academy' THEN
      target_audience := 'professional'; pref_column := 'academy';
      campaign_name := 'Professional Academy';
      campaign_subject := 'New GLOHAUS growth guidance';
      campaign_body := 'Explore guidance designed to help GLOHAUS professionals improve their marketplace presence and customer experience.';
      campaign_cta := '/professional/tools';
    WHEN 'milestones' THEN
      target_audience := 'professional'; pref_column := 'milestones';
      campaign_name := 'Business milestones';
      campaign_subject := 'Keep building your GLOHAUS business';
      campaign_body := 'Review your GLOHAUS activity, progress and business tools from your professional dashboard.';
      campaign_cta := '/professional';
    WHEN 'shop_selling' THEN
      target_audience := 'professional'; pref_column := 'shop_selling';
      campaign_name := 'Shop selling opportunities';
      campaign_subject := 'Grow your GLOHAUS Shop';
      campaign_body := 'Keep products, stock and fulfilment details current so customers can confidently buy from your GLOHAUS Shop.';
      campaign_cta := '/professional/products';
    ELSE
      RAISE EXCEPTION 'INVALID_PRESET' USING ERRCODE='22023';
  END CASE;

  INSERT INTO beauty.marketing_campaigns(
    preset_key,name,subject,audience,preference_key,status,cta_url,launched_by
  ) VALUES(
    target_preset,campaign_name,campaign_subject,target_audience,pref_column,'queued',campaign_cta,actor
  ) RETURNING id INTO campaign_id;

  EXECUTE format(
    $q$
      INSERT INTO beauty.marketing_outbox(
        campaign_id,recipient_user_id,email,subject,body,cta_url
      )
      SELECT $1,u.id,u.email,$2,$3,$4
      FROM beauty.users u
      JOIN beauty.marketing_preferences p ON p.user_id=u.id
      JOIN beauty.user_roles r ON r.user_id=u.id
      WHERE u.status='active'
        AND r.role=$5
        AND p.%I=true
      ON CONFLICT DO NOTHING
    $q$, pref_column
  )
  USING campaign_id,campaign_subject,campaign_body,campaign_cta,target_audience;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  UPDATE beauty.marketing_campaigns
  SET recipient_count=inserted_count,
      status=CASE WHEN inserted_count=0 THEN 'sent' ELSE 'queued' END,
      completed_at=CASE WHEN inserted_count=0 THEN now() ELSE NULL END
  WHERE id=campaign_id;

  INSERT INTO beauty.owner_audit_log(
    actor_user_id,actor_role,action,target_type,target_id,reason,metadata
  ) VALUES(
    actor,'owner','marketing_campaign_launched','marketing_campaign',campaign_id,
    'Owner launched preset marketing campaign',
    jsonb_build_object('preset',target_preset,'recipients',inserted_count)
  );

  RETURN jsonb_build_object(
    'campaignId',campaign_id,
    'name',campaign_name,
    'recipients',inserted_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION beauty.owner_marketing_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM beauty.require_owner();

  RETURN jsonb_build_object(
    'optedInUsers',(
      SELECT count(*)::integer
      FROM beauty.marketing_preferences p
      WHERE p.customer_offers OR p.new_professionals OR p.availability OR p.discover OR p.shop OR p.rebooking
         OR p.professional_growth OR p.marketplace_features OR p.professional_promotions OR p.academy
         OR p.milestones OR p.shop_selling
    ),
    'queue',jsonb_build_object(
      'pending',(
        SELECT count(*)::integer FROM beauty.marketing_outbox
        WHERE sent_at IS NULL AND attempts<5
      ),
      'retrying',(
        SELECT count(*)::integer FROM beauty.marketing_outbox
        WHERE sent_at IS NULL AND attempts BETWEEN 1 AND 4
      ),
      'exhausted',(
        SELECT count(*)::integer FROM beauty.marketing_outbox
        WHERE sent_at IS NULL AND attempts>=5
      )
    ),
    'campaigns',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT id,name,preset_key,status,recipient_count,sent_count,failed_count,
               booking_value_pence,glohaus_revenue_pence,promotion_cost_pence,created_at
        FROM beauty.marketing_campaigns
        ORDER BY created_at DESC
        LIMIT 25
      ) x
    ),'[]'::jsonb)
  );
END;
$function$
;


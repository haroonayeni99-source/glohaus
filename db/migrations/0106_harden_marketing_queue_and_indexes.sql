-- Harden marketing queue opt-outs and add missing foreign-key indexes.

CREATE INDEX IF NOT EXISTS feature_requests_created_by_idx
  ON beauty.feature_requests(created_by);
CREATE INDEX IF NOT EXISTS feature_votes_user_idx
  ON beauty.feature_votes(user_id);
CREATE INDEX IF NOT EXISTS marketing_campaigns_launched_by_idx
  ON beauty.marketing_campaigns(launched_by);
CREATE INDEX IF NOT EXISTS marketing_outbox_recipient_user_idx
  ON beauty.marketing_outbox(recipient_user_id);
CREATE INDEX IF NOT EXISTS product_notification_outbox_recipient_user_idx
  ON beauty.product_notification_outbox(recipient_user_id);

CREATE OR REPLACE FUNCTION beauty.set_my_marketing_preferences(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE uid uuid;
DECLARE result jsonb;
BEGIN
  SELECT id INTO uid FROM beauty.users WHERE auth_id=beauty.auth_id();
  IF uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

  INSERT INTO beauty.marketing_preferences(
    user_id,customer_offers,new_professionals,availability,discover,shop,rebooking,
    professional_growth,marketplace_features,professional_promotions,academy,milestones,shop_selling,updated_at
  )
  VALUES(
    uid,
    coalesce((payload->>'customerOffers')::boolean,false),
    coalesce((payload->>'newProfessionals')::boolean,false),
    coalesce((payload->>'availability')::boolean,false),
    coalesce((payload->>'discover')::boolean,false),
    coalesce((payload->>'shop')::boolean,false),
    coalesce((payload->>'rebooking')::boolean,false),
    coalesce((payload->>'professionalGrowth')::boolean,false),
    coalesce((payload->>'marketplaceFeatures')::boolean,false),
    coalesce((payload->>'professionalPromotions')::boolean,false),
    coalesce((payload->>'academy')::boolean,false),
    coalesce((payload->>'milestones')::boolean,false),
    coalesce((payload->>'shopSelling')::boolean,false),
    now()
  )
  ON CONFLICT(user_id) DO UPDATE SET
    customer_offers=excluded.customer_offers,
    new_professionals=excluded.new_professionals,
    availability=excluded.availability,
    discover=excluded.discover,
    shop=excluded.shop,
    rebooking=excluded.rebooking,
    professional_growth=excluded.professional_growth,
    marketplace_features=excluded.marketplace_features,
    professional_promotions=excluded.professional_promotions,
    academy=excluded.academy,
    milestones=excluded.milestones,
    shop_selling=excluded.shop_selling,
    updated_at=now();

  DELETE FROM beauty.marketing_outbox o
  USING beauty.marketing_campaigns c, beauty.marketing_preferences p
  WHERE o.campaign_id=c.id
    AND o.recipient_user_id=uid
    AND o.sent_at IS NULL
    AND p.user_id=uid
    AND (
      (c.preference_key='customer_offers' AND NOT p.customer_offers) OR
      (c.preference_key='new_professionals' AND NOT p.new_professionals) OR
      (c.preference_key='availability' AND NOT p.availability) OR
      (c.preference_key='discover' AND NOT p.discover) OR
      (c.preference_key='shop' AND NOT p.shop) OR
      (c.preference_key='rebooking' AND NOT p.rebooking) OR
      (c.preference_key='professional_growth' AND NOT p.professional_growth) OR
      (c.preference_key='marketplace_features' AND NOT p.marketplace_features) OR
      (c.preference_key='professional_promotions' AND NOT p.professional_promotions) OR
      (c.preference_key='academy' AND NOT p.academy) OR
      (c.preference_key='milestones' AND NOT p.milestones) OR
      (c.preference_key='shop_selling' AND NOT p.shop_selling)
    );

  UPDATE beauty.marketing_campaigns c
  SET status='sent', completed_at=coalesce(c.completed_at,now())
  WHERE c.status IN('queued','sending')
    AND NOT EXISTS(
      SELECT 1 FROM beauty.marketing_outbox o
      WHERE o.campaign_id=c.id AND o.sent_at IS NULL
    );

  SELECT to_jsonb(p)-'user_id' INTO result
  FROM beauty.marketing_preferences p WHERE p.user_id=uid;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION beauty.claim_marketing_notifications()
RETURNS TABLE(
  id uuid,campaign_id uuid,email text,subject text,body text,cta_url text,unsubscribe_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT o.id
    FROM beauty.marketing_outbox o
    JOIN beauty.marketing_campaigns c ON c.id=o.campaign_id
    JOIN beauty.marketing_preferences p ON p.user_id=o.recipient_user_id
    WHERE o.sent_at IS NULL
      AND o.due_at<=now()
      AND (o.claimed_until IS NULL OR o.claimed_until<now())
      AND o.attempts<5
      AND (
        (c.preference_key='customer_offers' AND p.customer_offers) OR
        (c.preference_key='new_professionals' AND p.new_professionals) OR
        (c.preference_key='availability' AND p.availability) OR
        (c.preference_key='discover' AND p.discover) OR
        (c.preference_key='shop' AND p.shop) OR
        (c.preference_key='rebooking' AND p.rebooking) OR
        (c.preference_key='professional_growth' AND p.professional_growth) OR
        (c.preference_key='marketplace_features' AND p.marketplace_features) OR
        (c.preference_key='professional_promotions' AND p.professional_promotions) OR
        (c.preference_key='academy' AND p.academy) OR
        (c.preference_key='milestones' AND p.milestones) OR
        (c.preference_key='shop_selling' AND p.shop_selling)
      )
    ORDER BY o.due_at,o.id
    LIMIT 20
    FOR UPDATE OF o SKIP LOCKED
  ),
  claimed AS (
    UPDATE beauty.marketing_outbox o
    SET claimed_until=now()+interval '5 minutes',
        attempts=o.attempts+1
    FROM eligible
    WHERE o.id=eligible.id
    RETURNING o.*
  )
  SELECT c.id,c.campaign_id,c.email,c.subject,c.body,c.cta_url,p.unsubscribe_token
  FROM claimed c
  JOIN beauty.marketing_preferences p ON p.user_id=c.recipient_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION beauty.unsubscribe_marketing(target_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE uid uuid;
BEGIN
  UPDATE beauty.marketing_preferences
  SET customer_offers=false,new_professionals=false,availability=false,discover=false,shop=false,rebooking=false,
      professional_growth=false,marketplace_features=false,professional_promotions=false,academy=false,milestones=false,
      shop_selling=false,updated_at=now()
  WHERE unsubscribe_token=target_token
  RETURNING user_id INTO uid;

  IF uid IS NULL THEN RETURN false; END IF;

  DELETE FROM beauty.marketing_outbox
  WHERE recipient_user_id=uid AND sent_at IS NULL;

  UPDATE beauty.marketing_campaigns c
  SET status='sent', completed_at=coalesce(c.completed_at,now())
  WHERE c.status IN('queued','sending')
    AND NOT EXISTS(
      SELECT 1 FROM beauty.marketing_outbox o
      WHERE o.campaign_id=c.id AND o.sent_at IS NULL
    );

  RETURN true;
END;
$$;

ALTER FUNCTION beauty.set_my_marketing_preferences(jsonb) OWNER TO postgres;
ALTER FUNCTION beauty.claim_marketing_notifications() OWNER TO postgres;
ALTER FUNCTION beauty.unsubscribe_marketing(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION beauty.set_my_marketing_preferences(jsonb),
  beauty.claim_marketing_notifications(),beauty.unsubscribe_marketing(uuid)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION beauty.set_my_marketing_preferences(jsonb) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.claim_marketing_notifications(),
  beauty.unsubscribe_marketing(uuid) TO beauty_payment_worker;

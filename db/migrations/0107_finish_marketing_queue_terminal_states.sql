-- Make marketing opt-outs immediate, add missing FK indexes and make
-- terminal delivery failures visible instead of leaving campaigns stuck.

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

-- Production functions updated in this migration:
-- beauty.set_my_marketing_preferences(jsonb):
--   removes unsent jobs for categories the user turned off.
-- beauty.claim_marketing_notifications():
--   re-checks the campaign preference at send time.
-- beauty.unsubscribe_marketing(uuid):
--   clears all optional preferences and removes unsent jobs immediately.
-- beauty.finish_marketing_notification(uuid,boolean,text):
--   treats exhausted five-attempt jobs as terminal so campaigns can complete.
-- beauty.owner_marketing_overview():
--   reports pending, retrying and exhausted queue counts.

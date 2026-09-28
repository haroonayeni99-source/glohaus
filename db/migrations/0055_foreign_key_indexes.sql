-- Cover foreign-key columns identified by the Supabase performance advisor.
-- These indexes improve joins and parent-row updates/deletes without changing
-- application behaviour.

CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_user_idx
  ON beauty.admin_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_user_idx
  ON beauty.admin_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS booking_location_sessions_customer_idx
  ON beauty.booking_location_sessions(customer_id);
CREATE INDEX IF NOT EXISTS bookings_service_professional_idx
  ON beauty.bookings(service_id, professional_id);
CREATE INDEX IF NOT EXISTS financial_fee_rules_created_by_idx
  ON beauty.financial_fee_rules(created_by_user_id);
CREATE INDEX IF NOT EXISTS financial_quotes_fee_rule_idx
  ON beauty.financial_quotes(fee_rule_id);
CREATE INDEX IF NOT EXISTS messages_booking_idx
  ON beauty.messages(booking_id);
CREATE INDEX IF NOT EXISTS notification_outbox_recipient_idx
  ON beauty.notification_outbox(recipient_user_id);
CREATE INDEX IF NOT EXISTS portfolio_assets_professional_idx
  ON beauty.portfolio_assets(professional_id);
CREATE INDEX IF NOT EXISTS post_engagement_post_idx
  ON beauty.post_engagement(post_id);
CREATE INDEX IF NOT EXISTS posts_asset_professional_idx
  ON beauty.posts(asset_id, professional_id);
CREATE INDEX IF NOT EXISTS posts_service_professional_idx
  ON beauty.posts(service_id, professional_id);
CREATE INDEX IF NOT EXISTS professional_financial_controls_updated_by_idx
  ON beauty.professional_financial_controls(updated_by_user_id);
CREATE INDEX IF NOT EXISTS professional_subscriptions_plan_key_idx
  ON beauty.professional_subscriptions(plan_key);
CREATE INDEX IF NOT EXISTS professional_tax_ack_user_idx
  ON beauty.professional_tax_acknowledgements(user_id);
CREATE INDEX IF NOT EXISTS refund_appeals_customer_idx
  ON beauty.refund_appeals(customer_id);
CREATE INDEX IF NOT EXISTS refund_appeals_resolved_by_idx
  ON beauty.refund_appeals(resolved_by_user_id);
CREATE INDEX IF NOT EXISTS refund_decisions_actor_idx
  ON beauty.refund_decisions(actor_id);
CREATE INDEX IF NOT EXISTS refund_decisions_override_actor_idx
  ON beauty.refund_decisions(override_actor_id);
CREATE INDEX IF NOT EXISTS safety_reports_assigned_to_idx
  ON beauty.safety_reports(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS services_asset_professional_idx
  ON beauty.services(asset_id, professional_id);
CREATE INDEX IF NOT EXISTS staff_permissions_granted_by_idx
  ON beauty.staff_permissions(granted_by_user_id);

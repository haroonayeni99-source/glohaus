-- Observe payout state from the scheduled notification worker. No payout trigger,
-- provider request, money movement, fee or balance update is introduced.
CREATE TABLE beauty.payout_notification_start(id boolean PRIMARY KEY DEFAULT true CHECK(id),starts_at timestamptz NOT NULL DEFAULT now());
INSERT INTO beauty.payout_notification_start(id) VALUES(true);
ALTER TABLE beauty.payout_notification_start ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.payout_notification_start FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.payout_notification_start FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT ON beauty.payout_notification_start,beauty.financial_payouts TO beauty_notification_ops;
CREATE POLICY payout_notice_start_read ON beauty.payout_notification_start FOR SELECT TO beauty_notification_ops USING(true);
CREATE POLICY payout_notice_read ON beauty.financial_payouts FOR SELECT TO beauty_notification_ops USING(true);
DO $$ DECLARE constraint_row record; definition text; BEGIN
 SELECT conname,pg_get_constraintdef(oid) AS definition INTO STRICT constraint_row FROM pg_constraint
 WHERE conrelid='beauty.in_app_notifications'::regclass AND contype='c' AND conname='in_app_notifications_kind_check';
 definition:=replace(constraint_row.definition,'ARRAY[','ARRAY[''payout_updated''::text,');
 IF definition=constraint_row.definition THEN RAISE EXCEPTION 'Unexpected notification kind constraint'; END IF;
 EXECUTE format('ALTER TABLE beauty.in_app_notifications DROP CONSTRAINT %I',constraint_row.conname);
 EXECUTE format('ALTER TABLE beauty.in_app_notifications ADD CONSTRAINT %I %s',constraint_row.conname,definition);
END $$;
CREATE FUNCTION beauty.prepare_payout_status_notifications() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE result integer;
BEGIN
 WITH candidates AS (
  SELECT p.*,pro.user_id,false AS delayed FROM beauty.financial_payouts p JOIN beauty.professional_profiles pro ON pro.id=p.professional_id
  JOIN beauty.users u ON u.id=pro.user_id JOIN beauty.payout_notification_start start ON start.id
  WHERE u.status='active' AND u.deleted_at IS NULL AND (p.created_at>=start.starts_at OR p.updated_at>=start.starts_at)
  UNION ALL
  SELECT p.*,pro.user_id,true AS delayed FROM beauty.financial_payouts p JOIN beauty.professional_profiles pro ON pro.id=p.professional_id
  JOIN beauty.users u ON u.id=pro.user_id JOIN beauty.payout_notification_start start ON start.id
  WHERE u.status='active' AND u.deleted_at IS NULL AND (p.created_at>=start.starts_at OR p.updated_at>=start.starts_at)
  AND p.status IN('requested','processing') AND p.expected_arrival_at<now()
 ), notices AS (
  INSERT INTO beauty.in_app_notifications(user_id,kind,title,body,href,event_key)
  SELECT user_id,'payout_updated',CASE WHEN delayed THEN 'Payout taking longer than estimated' ELSE 'Payout status: '||status END,
   CASE WHEN delayed THEN 'Your payout is still pending after its estimated arrival. Estimates are not guaranteed. Check your wallet and contact support if the delay continues.'
   ELSE 'Your '||kind||' withdrawal is '||status||'. Requested £'||to_char(requested_pence/100.0,'FM999999990.00')||', withdrawal fee £'||to_char(withdrawal_fee_pence/100.0,'FM999999990.00')||', bank amount £'||to_char(bank_amount_pence/100.0,'FM999999990.00')||'. Check your wallet for the provider status, estimated arrival and any holds.' END,
   '/professional/wallet','payout:'||id::text||':'||CASE WHEN delayed THEN 'delayed:'||md5(expected_arrival_at::text) ELSE status||':'||md5(updated_at::text) END
  FROM candidates ON CONFLICT DO NOTHING RETURNING id,user_id
 ), emails AS (
  INSERT INTO beauty.notification_outbox(kind,recipient_user_id,notification_id,event_reference)
  SELECT 'professional_alert',user_id,id,id::text FROM notices ON CONFLICT DO NOTHING RETURNING id
 ) SELECT count(*)::integer INTO result FROM emails;
 RETURN result;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_notification_ops;
ALTER FUNCTION beauty.prepare_payout_status_notifications() OWNER TO beauty_notification_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_notification_ops;
REVOKE ALL ON FUNCTION beauty.prepare_payout_status_notifications() FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.prepare_payout_status_notifications() TO beauty_payment_worker;

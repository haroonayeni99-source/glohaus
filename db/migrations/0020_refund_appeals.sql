-- A professional's no-refund decision can be reviewed without exposing it to unrelated accounts.
DROP POLICY refund_participant ON beauty.refund_decisions;
CREATE POLICY refund_participant ON beauty.refund_decisions FOR SELECT TO beauty_app USING(
  EXISTS(
    SELECT 1 FROM beauty.bookings b
    JOIN beauty.users customer ON customer.id=b.customer_id
    JOIN beauty.professional_profiles professional ON professional.id=b.professional_id
    WHERE b.id=booking_id AND (customer.auth_id=beauty.auth_id() OR professional.user_id=(SELECT id FROM beauty.users WHERE auth_id=beauty.auth_id()))
  )
);

ALTER TABLE beauty.refund_decisions
  ADD COLUMN override_actor_id uuid REFERENCES beauty.users(id),
  ADD COLUMN overridden_at timestamptz,
  ADD COLUMN override_reason text CHECK(override_reason IS NULL OR length(override_reason) BETWEEN 5 AND 500);

CREATE TABLE beauty.refund_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES beauty.bookings(id),
  refund_decision_id uuid NOT NULL UNIQUE REFERENCES beauty.refund_decisions(id),
  customer_id uuid NOT NULL REFERENCES beauty.users(id),
  reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','approved','rejected')),
  resolved_by_user_id uuid REFERENCES beauty.users(id),
  resolution_reason text CHECK(resolution_reason IS NULL OR length(resolution_reason) BETWEEN 5 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE beauty.refund_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.refund_appeals FORCE ROW LEVEL SECURITY;
CREATE POLICY appeal_customer_read ON beauty.refund_appeals FOR SELECT TO beauty_app USING(
  EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=customer_id AND u.auth_id=beauty.auth_id())
);
CREATE POLICY appeal_ops ON beauty.refund_appeals FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.refund_appeals TO beauty_app;
GRANT SELECT,INSERT,UPDATE ON beauty.refund_appeals TO beauty_booking_ops;
GRANT SELECT,UPDATE(status,resolved_by_user_id,resolution_reason,resolved_at) ON beauty.refund_appeals TO beauty_admin_ops;
CREATE POLICY admin_appeals_read ON beauty.refund_appeals FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY admin_appeals_update ON beauty.refund_appeals FOR UPDATE TO beauty_admin_ops USING(true) WITH CHECK(true);
GRANT SELECT,UPDATE(override_actor_id,overridden_at,override_reason,reasonable_cause_accepted,refund_percent,amount_pence,status) ON beauty.refund_decisions TO beauty_admin_ops;
CREATE POLICY admin_refund_decisions_read ON beauty.refund_decisions FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY admin_refund_decisions_update ON beauty.refund_decisions FOR UPDATE TO beauty_admin_ops USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.payments TO beauty_admin_ops;
CREATE POLICY admin_payments_read ON beauty.payments FOR SELECT TO beauty_admin_ops USING(true);
GRANT INSERT(actor_reference,action,target_user_id,reason) ON beauty.admin_audit_logs TO beauty_booking_ops;
CREATE POLICY booking_ops_audit_insert ON beauty.admin_audit_logs FOR INSERT TO beauty_booking_ops WITH CHECK(true);
GRANT EXECUTE ON FUNCTION beauty.require_admin() TO beauty_booking_ops;

CREATE FUNCTION beauty.submit_refund_appeal(target uuid, appeal_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; d beauty.refund_decisions; a beauty.refund_appeals;
BEGIN
  SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';
  SELECT r.* INTO d FROM beauty.refund_decisions r JOIN beauty.bookings b ON b.id=r.booking_id WHERE r.booking_id=target AND b.customer_id=actor FOR UPDATE OF r;
  IF actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF d.id IS NULL OR d.status<>'no_refund' OR length(trim(appeal_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM beauty.refund_appeals WHERE booking_id=target;
  IF a.id IS NULL THEN
    INSERT INTO beauty.refund_appeals(booking_id,refund_decision_id,customer_id,reason) VALUES(target,d.id,actor,trim(appeal_reason)) RETURNING * INTO a;
  END IF;
  RETURN jsonb_build_object('id',a.id,'status',a.status);
END $$;

CREATE FUNCTION beauty.resolve_refund_appeal(target uuid, approved boolean, percentage integer, decision_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; a beauty.refund_appeals; d beauty.refund_decisions; p beauty.payments; amount integer;
BEGIN
  actor:=beauty.require_admin();
  IF approved IS NULL OR percentage IS NULL OR percentage NOT BETWEEN 0 AND 100 OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM beauty.refund_appeals WHERE id=target FOR UPDATE;
  IF a.id IS NULL OR a.status<>'open' OR (approved AND percentage=0) OR (NOT approved AND percentage<>0) THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  SELECT * INTO d FROM beauty.refund_decisions WHERE id=a.refund_decision_id FOR UPDATE;
  SELECT * INTO p FROM beauty.payments WHERE booking_id=a.booking_id FOR UPDATE;
  IF d.status<>'no_refund' OR p.captured_pence<=p.refunded_pence THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  amount:=CASE WHEN approved THEN greatest(0,floor(p.captured_pence*percentage/100.0)::integer-p.refunded_pence) ELSE 0 END;
  UPDATE beauty.refund_appeals SET status=CASE WHEN approved THEN 'approved' ELSE 'rejected' END,resolved_by_user_id=actor,resolution_reason=trim(decision_reason),resolved_at=now() WHERE id=target;
  IF approved THEN UPDATE beauty.refund_decisions SET override_actor_id=actor,overridden_at=now(),override_reason=trim(decision_reason),reasonable_cause_accepted=true,refund_percent=percentage,amount_pence=amount,status=CASE WHEN amount=0 THEN 'no_refund' ELSE 'queued' END WHERE id=d.id; END IF;
  INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,reason) VALUES(actor::text,'refund_appeal.'||target::text||'.'||CASE WHEN approved THEN 'approved' ELSE 'rejected' END,a.customer_id,trim(decision_reason));
  RETURN jsonb_build_object('decisionId',d.id,'amountPence',amount,'paymentIntentId',p.stripe_payment_intent_id,'status',CASE WHEN approved AND amount>0 THEN 'queued' ELSE 'no_refund' END);
END $$;

CREATE OR REPLACE FUNCTION beauty.admin_booking_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM beauty.require_admin();
  RETURN jsonb_build_object(
    'bookings',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM(SELECT id,service_name,professional_name,customer_name,starts_at,status,price_pence FROM beauty.bookings ORDER BY created_at DESC LIMIT 100)x),
    'reviews',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM(SELECT id,rating,body,public_name,moderation_status FROM beauty.reviews ORDER BY created_at DESC LIMIT 100)x),
    'appeals',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM(SELECT a.id,b.service_name,b.customer_name,b.professional_name,a.reason,a.status,a.created_at FROM beauty.refund_appeals a JOIN beauty.bookings b ON b.id=a.booking_id ORDER BY CASE WHEN a.status='open' THEN 0 ELSE 1 END,a.created_at DESC LIMIT 100)x)
  );
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.submit_refund_appeal(uuid,text) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.resolve_refund_appeal(uuid,boolean,integer,text) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.admin_booking_overview() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.submit_refund_appeal(uuid,text),beauty.resolve_refund_appeal(uuid,boolean,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.submit_refund_appeal(uuid,text),beauty.resolve_refund_appeal(uuid,boolean,integer,text) TO beauty_app;

CREATE TABLE beauty.refund_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL UNIQUE REFERENCES beauty.bookings(id),actor_id uuid NOT NULL REFERENCES beauty.users(id),
 reasonable_cause_accepted boolean NOT NULL,refund_percent integer NOT NULL CHECK(refund_percent BETWEEN 0 AND 100),amount_pence integer NOT NULL CHECK(amount_pence>=0),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','pending','succeeded','failed','no_refund')),
 stripe_refund_id text UNIQUE,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beauty.refund_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.refund_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY refund_participant ON beauty.refund_decisions FOR SELECT TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.id=booking_id));
CREATE POLICY refund_ops ON beauty.refund_decisions FOR ALL TO beauty_booking_ops USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.refund_decisions TO beauty_app;
GRANT SELECT,INSERT,UPDATE ON beauty.refund_decisions TO beauty_booking_ops;
CREATE FUNCTION beauty.decide_refund(target uuid,accepted boolean,percentage integer,decision_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;b beauty.bookings;p beauty.payments;d beauty.refund_decisions;amount integer;chosen integer;
BEGIN
 SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active';
 SELECT * INTO b FROM beauty.bookings WHERE id=target FOR UPDATE;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=b.professional_id AND user_id=actor) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT(b.status='cancelled' OR b.status='expired' OR(b.status='payment_pending' AND b.hold_expires_at<=now())) OR accepted IS NULL OR percentage IS NULL OR percentage NOT BETWEEN 0 AND 100 OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE='22023';END IF;
 SELECT * INTO p FROM beauty.payments WHERE booking_id=target FOR UPDATE;
 SELECT * INTO d FROM beauty.refund_decisions WHERE booking_id=target;
 IF d.id IS NOT NULL THEN RETURN jsonb_build_object('id',d.id,'amountPence',d.amount_pence,'paymentIntentId',p.stripe_payment_intent_id,'status',d.status);END IF;
 IF p.status='pending' THEN RAISE EXCEPTION 'PAYMENT_NOT_SETTLED' USING ERRCODE='22023';END IF;
 -- Professionals cannot reduce mandatory refunds for their own cancellations or timely customer cancellations.
 chosen:=CASE WHEN b.status<>'cancelled' OR p.updated_at>b.cancelled_at OR b.cancellation_actor='professional' OR b.starts_at-b.cancelled_at>=interval '24 hours' THEN 100 WHEN accepted THEN percentage ELSE 0 END;
 amount:=greatest(0,floor(p.captured_pence*chosen/100.0)::integer-p.refunded_pence);
 INSERT INTO beauty.refund_decisions(booking_id,actor_id,reasonable_cause_accepted,refund_percent,amount_pence,reason,status) VALUES(target,actor,accepted,chosen,amount,trim(decision_reason),CASE WHEN amount=0 THEN 'no_refund' ELSE 'queued' END) RETURNING * INTO d;
 IF amount=0 THEN UPDATE beauty.payments SET status=CASE WHEN refunded_pence>0 THEN 'partially_refunded' ELSE 'paid' END WHERE booking_id=target;END IF;
 RETURN jsonb_build_object('id',d.id,'amountPence',d.amount_pence,'paymentIntentId',p.stripe_payment_intent_id,'status',d.status);
END $$;
CREATE FUNCTION beauty.apply_refund_result(target uuid,provider_ref text,amount integer,provider_status text,intent_ref text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d beauty.refund_decisions;expected_intent text;
BEGIN
 SELECT * INTO d FROM beauty.refund_decisions WHERE id=target FOR UPDATE;
 SELECT stripe_payment_intent_id INTO expected_intent FROM beauty.payments WHERE booking_id=d.booking_id;
 IF expected_intent IS DISTINCT FROM intent_ref OR intent_ref IS NULL OR d.id IS NULL OR d.amount_pence IS DISTINCT FROM amount OR amount<=0 OR provider_ref IS NULL OR(d.stripe_refund_id IS NOT NULL AND d.stripe_refund_id<>provider_ref) THEN RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';END IF;
 IF d.status='succeeded' THEN RETURN;END IF;
 IF provider_status NOT IN('succeeded','pending','failed','canceled','requires_action') THEN RAISE EXCEPTION 'REFUND_MISMATCH' USING ERRCODE='22023';END IF;
 UPDATE beauty.refund_decisions SET stripe_refund_id=provider_ref,status=CASE WHEN provider_status='succeeded' THEN 'succeeded' WHEN provider_status IN('failed','canceled') THEN 'failed' ELSE 'pending' END WHERE id=target;
 IF provider_status='succeeded' THEN UPDATE beauty.payments SET refunded_pence=refunded_pence+amount,status=CASE WHEN refunded_pence+amount=captured_pence THEN 'refunded' ELSE 'partially_refunded' END,updated_at=now() WHERE booking_id=d.booking_id;END IF;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_booking_ops;
ALTER FUNCTION beauty.decide_refund(uuid,boolean,integer,text) OWNER TO beauty_booking_ops;
ALTER FUNCTION beauty.apply_refund_result(uuid,text,integer,text,text) OWNER TO beauty_booking_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_booking_ops;
REVOKE ALL ON FUNCTION beauty.decide_refund(uuid,boolean,integer,text),beauty.apply_refund_result(uuid,text,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.decide_refund(uuid,boolean,integer,text) TO beauty_app;
GRANT EXECUTE ON FUNCTION beauty.apply_refund_result(uuid,text,integer,text,text) TO beauty_payment_worker;

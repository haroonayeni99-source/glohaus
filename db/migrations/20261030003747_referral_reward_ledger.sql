-- Private Stage 1 infrastructure. All channels OFF, no budget, credit only.
ALTER TABLE beauty.referral_first_attribution DROP CONSTRAINT referral_first_attribution_channel_check;
ALTER TABLE beauty.referral_first_attribution ADD CHECK(channel IN ('customer','professional-to-professional','professional-introducing-own-customer','manual-partner'));
CREATE TRIGGER referral_attribution_no_truncate BEFORE TRUNCATE ON beauty.referral_first_attribution FOR EACH STATEMENT EXECUTE FUNCTION beauty.referral_attribution_immutable();
CREATE TABLE beauty.referral_rule_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),channel text NOT NULL CHECK(channel IN ('customer','professional-to-professional','professional-introducing-own-customer','manual-partner')),
 reward_type text NOT NULL DEFAULT 'glohaus_credit' CHECK(reward_type='glohaus_credit'),amount_pence integer NOT NULL DEFAULT 0 CHECK(amount_pence BETWEEN 0 AND 1000000),
 hold_days integer NOT NULL DEFAULT 14 CHECK(hold_days BETWEEN 0 AND 365),person_monthly_cap integer NOT NULL DEFAULT 3 CHECK(person_monthly_cap BETWEEN 0 AND 1000000),
 channel_monthly_cap integer CHECK(channel_monthly_cap BETWEEN 0 AND 10000000),minimum_net_pence integer NOT NULL DEFAULT 200 CHECK(minimum_net_pence BETWEEN 0 AND 100000000),
 maximum_share_bps integer NOT NULL DEFAULT 4000 CHECK(maximum_share_bps BETWEEN 0 AND 10000),enabled boolean NOT NULL DEFAULT false,
 actor_user_id uuid,reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX referral_rule_latest ON beauty.referral_rule_versions(channel,created_at DESC,id DESC);
INSERT INTO beauty.referral_rule_versions(channel,reason) SELECT unnest(ARRAY['customer','professional-to-professional','professional-introducing-own-customer','manual-partner']),'Disabled Stage 1 defaults';
CREATE TABLE beauty.referral_control_versions(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,monthly_budget_pence bigint CHECK(monthly_budget_pence BETWEEN 0 AND 1000000000),
 emergency_stop boolean NOT NULL DEFAULT true,launch_approved boolean NOT NULL DEFAULT false,actor_user_id uuid,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO beauty.referral_control_versions(reason) VALUES('Disabled Stage 1 defaults; Owner budget unset');
CREATE TABLE beauty.referral_risk_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),referral_id uuid NOT NULL REFERENCES beauty.referral_first_attribution(referral_id),
 reason text NOT NULL CHECK(reason IN ('device','phone','email_pattern','payment_card','address','ip','linked_account')),
 evidence_key text NOT NULL CHECK(length(evidence_key) BETWEEN 1 AND 200),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(referral_id,reason,evidence_key)
);
CREATE TABLE beauty.referral_risk_decisions(
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,case_id uuid NOT NULL REFERENCES beauty.referral_risk_cases(id),
 status text NOT NULL CHECK(status IN ('approved','rejected')),actor_user_id uuid NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX referral_risk_decision_latest ON beauty.referral_risk_decisions(case_id,sequence DESC);
CREATE TABLE beauty.referral_booking_rule_snapshots(
 booking_id uuid PRIMARY KEY REFERENCES beauty.bookings(id),referral_id uuid NOT NULL REFERENCES beauty.referral_first_attribution(referral_id),
 rule_id uuid NOT NULL REFERENCES beauty.referral_rule_versions(id),control_id bigint NOT NULL REFERENCES beauty.referral_control_versions(id),was_live boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beauty.referral_rewards(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL UNIQUE REFERENCES beauty.bookings(id),referral_id uuid NOT NULL UNIQUE REFERENCES beauty.referral_first_attribution(referral_id),
 earner_user_id uuid NOT NULL,channel text NOT NULL,amount_pence integer NOT NULL CHECK(amount_pence>0),retained_net_pence bigint NOT NULL,
 reward_type text NOT NULL DEFAULT 'glohaus_credit' CHECK(reward_type='glohaus_credit'),rule_id uuid NOT NULL REFERENCES beauty.referral_rule_versions(id),rule_snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX referral_rewards_month ON beauty.referral_rewards(created_at,earner_user_id,channel);
CREATE TABLE beauty.referral_reward_events(
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,reward_id uuid NOT NULL REFERENCES beauty.referral_rewards(id),status text NOT NULL CHECK(status IN ('pending','approved','released','reversed','rejected')),
 credit_delta_pence integer NOT NULL DEFAULT 0,actor_user_id uuid,reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(reward_id,status)
);
CREATE INDEX referral_reward_event_latest ON beauty.referral_reward_events(reward_id,sequence DESC);
-- These are simulations, never credit-bearing records or user promises.
CREATE TABLE beauty.referral_reward_simulations(
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,booking_id uuid NOT NULL REFERENCES beauty.bookings(id),referral_id uuid NOT NULL REFERENCES beauty.referral_first_attribution(referral_id),
 rule_id uuid NOT NULL REFERENCES beauty.referral_rule_versions(id),decision text NOT NULL,would_earn_pence integer NOT NULL CHECK(would_earn_pence>=0),retained_net_pence bigint,
 fingerprint text NOT NULL,evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX referral_simulation_latest ON beauty.referral_reward_simulations(booking_id,sequence DESC);
CREATE TABLE beauty.referral_monitor_cursor(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),last_booking_id uuid);
INSERT INTO beauty.referral_monitor_cursor DEFAULT VALUES;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['referral_rule_versions','referral_control_versions','referral_risk_cases','referral_risk_decisions','referral_booking_rule_snapshots','referral_rewards','referral_reward_events','referral_reward_simulations','referral_monitor_cursor'] LOOP
 EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker',t);
 IF t<>'referral_monitor_cursor' THEN
 EXECUTE format('CREATE TRIGGER referral_append_only BEFORE UPDATE OR DELETE ON beauty.%I FOR EACH ROW EXECUTE FUNCTION beauty.referral_attribution_immutable()',t);
 EXECUTE format('CREATE TRIGGER referral_no_truncate BEFORE TRUNCATE ON beauty.%I FOR EACH STATEMENT EXECUTE FUNCTION beauty.referral_attribution_immutable()',t);END IF;
 END LOOP;
END $$;
CREATE FUNCTION beauty.snapshot_referral_booking_rule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO beauty.referral_booking_rule_snapshots(booking_id,referral_id,rule_id,control_id,was_live)
 SELECT NEW.id,f.referral_id,r.id,c.id,c.launch_approved AND NOT c.emergency_stop AND r.enabled
 FROM beauty.referral_first_attribution f JOIN LATERAL(SELECT * FROM beauty.referral_rule_versions WHERE channel=f.channel ORDER BY created_at DESC,id DESC LIMIT 1)r ON true
 CROSS JOIN LATERAL(SELECT * FROM beauty.referral_control_versions ORDER BY id DESC LIMIT 1)c
 WHERE (f.channel='professional-to-professional' AND f.referred_user_id=(SELECT user_id FROM beauty.professional_profiles WHERE id=NEW.professional_id)) OR (f.channel<>'professional-to-professional' AND f.referred_user_id=NEW.customer_id)
 ORDER BY f.attributed_at,f.referral_id LIMIT 1;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.snapshot_referral_booking_rule() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER referral_booking_rule_snapshot AFTER INSERT ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.snapshot_referral_booking_rule();
CREATE FUNCTION beauty.referral_retained_net(target uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN c.booking_id IS NOT NULL AND c.charge_pence=p.captured_pence AND EXISTS(SELECT 1 FROM beauty.financial_ledger_transactions WHERE event_reference='booking-payment:'||target::text)
 THEN (SELECT coalesce(sum(-e.amount_pence::bigint) FILTER(WHERE a.code='platform_fee_revenue'),0)-greatest(c.fee_pence::bigint,coalesce(sum(e.amount_pence::bigint) FILTER(WHERE a.code='provider_cost'),0))
 FROM beauty.financial_ledger_transactions t JOIN beauty.financial_ledger_entries e ON e.transaction_id=t.id JOIN beauty.financial_ledger_accounts a ON a.id=e.account_id WHERE t.reference_type='booking' AND t.reference_id=target) ELSE NULL END
 FROM beauty.payments p LEFT JOIN beauty.booking_provider_costs c ON c.booking_id=p.booking_id WHERE p.booking_id=target
$$;
REVOKE ALL ON FUNCTION beauty.referral_retained_net(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.referral_reward_evidence(target uuid,attribution uuid,rule uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r beauty.referral_rule_versions;a beauty.referral_first_attribution;b beauty.bookings;n bigint;
BEGIN
 SELECT * INTO r FROM beauty.referral_rule_versions WHERE id=rule;SELECT * INTO a FROM beauty.referral_first_attribution WHERE referral_id=attribution;SELECT * INTO b FROM beauty.bookings WHERE id=target;
 IF r.id IS NULL OR a.referral_id IS NULL OR b.id IS NULL OR r.channel<>a.channel THEN RETURN jsonb_build_object('decision','INVALID_ATTRIBUTION');END IF;
 IF NOT EXISTS(SELECT 1 FROM beauty.users WHERE id=a.referrer_user_id AND status='active' AND deleted_at IS NULL AND (restricted_until IS NULL OR restricted_until<=now())) OR NOT EXISTS(SELECT 1 FROM beauty.users WHERE id=a.referred_user_id AND status='active' AND deleted_at IS NULL AND (restricted_until IS NULL OR restricted_until<=now())) THEN RETURN jsonb_build_object('decision','INACTIVE_ACCOUNT');END IF;
 IF a.referrer_user_id=a.referred_user_id OR b.customer_id=a.referrer_user_id THEN RETURN jsonb_build_object('decision','SELF_REFERRAL');END IF;
 IF a.channel='professional-to-professional' THEN
 IF NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=b.professional_id AND user_id=a.referred_user_id) THEN RETURN jsonb_build_object('decision','WRONG_REFERRED_PERSON');END IF;
 ELSIF b.customer_id<>a.referred_user_id THEN RETURN jsonb_build_object('decision','WRONG_REFERRED_PERSON');END IF;
 IF a.channel='professional-introducing-own-customer' AND NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE id=b.professional_id AND user_id=a.referrer_user_id) THEN RETURN jsonb_build_object('decision','WRONG_PROFESSIONAL');END IF;
 IF a.attributed_at>b.created_at THEN RETURN jsonb_build_object('decision','BOOKED_BEFORE_ATTRIBUTION');END IF;
 IF NOT beauty.referral_booking_is_valid(target) THEN RETURN jsonb_build_object('decision','BOOKING_INELIGIBLE');END IF;
 IF EXISTS(SELECT 1 FROM beauty.bookings old JOIN beauty.payments p ON p.booking_id=old.id WHERE old.customer_id=b.customer_id AND old.id<>b.id AND p.captured_pence>0 AND (old.created_at,old.id)<(b.created_at,b.id)) THEN RETURN jsonb_build_object('decision','CUSTOMER_NOT_NEW');END IF;
 IF EXISTS(SELECT 1 FROM beauty.referral_risk_cases c LEFT JOIN LATERAL(SELECT status FROM beauty.referral_risk_decisions d WHERE d.case_id=c.id ORDER BY sequence DESC LIMIT 1)d ON true WHERE c.referral_id=a.referral_id AND coalesce(d.status,'open')<>'approved') OR EXISTS(SELECT 1 FROM beauty.growth_referral_review_cases WHERE referral_id=a.referral_id AND status IN ('open','under_review','rejected')) THEN RETURN jsonb_build_object('decision','FLAGGED');END IF;
 IF b.completed_at>now()-r.hold_days*interval '1 day' THEN RETURN jsonb_build_object('decision','HOLD_PERIOD');END IF;
 n:=beauty.referral_retained_net(target);IF n IS NULL THEN RETURN jsonb_build_object('decision','PENDING_ACTUAL_COSTS');END IF;
 IF n<r.minimum_net_pence THEN RETURN jsonb_build_object('decision','NET_BELOW_MINIMUM','net',n);END IF;
 IF r.amount_pence=0 THEN RETURN jsonb_build_object('decision','AMOUNT_UNSET','net',n);END IF;
 IF r.amount_pence::bigint*10000>n*r.maximum_share_bps THEN RETURN jsonb_build_object('decision','SHARE_LIMIT','net',n);END IF;
 RETURN jsonb_build_object('decision','QUALIFIED','net',n,'amount',r.amount_pence);
END $$;
REVOKE ALL ON FUNCTION beauty.referral_reward_evidence(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.guard_referral_reward() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r beauty.referral_rule_versions;cap_rule beauty.referral_rule_versions;c beauty.referral_control_versions;a beauty.referral_first_attribution;e jsonb;m timestamptz;spent bigint;people bigint;channel_count bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('referral-rewards',0));
 SELECT * INTO STRICT c FROM beauty.referral_control_versions ORDER BY id DESC LIMIT 1;
 SELECT * INTO STRICT cap_rule FROM beauty.referral_rule_versions WHERE channel=NEW.channel ORDER BY created_at DESC,id DESC LIMIT 1;
 IF c.emergency_stop OR NOT c.launch_approved OR NOT (SELECT enabled FROM beauty.referral_rule_versions WHERE channel=NEW.channel ORDER BY created_at DESC,id DESC LIMIT 1) THEN RAISE EXCEPTION 'REWARDS_OFF' USING ERRCODE='23514';END IF;
 IF c.monthly_budget_pence IS NULL THEN RAISE EXCEPTION 'BUDGET_UNSET' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM beauty.referral_booking_rule_snapshots WHERE booking_id=NEW.booking_id AND referral_id=NEW.referral_id AND was_live) THEN RAISE EXCEPTION 'PRE_LAUNCH_BOOKING' USING ERRCODE='23514';END IF;
 SELECT * INTO STRICT r FROM beauty.referral_rule_versions WHERE id=(SELECT rule_id FROM beauty.referral_booking_rule_snapshots WHERE booking_id=NEW.booking_id);
 SELECT * INTO STRICT a FROM beauty.referral_first_attribution WHERE referral_id=NEW.referral_id;
 IF NEW.rule_id<>r.id OR NEW.channel<>a.channel OR NEW.earner_user_id<>a.referrer_user_id OR NEW.amount_pence<>r.amount_pence THEN RAISE EXCEPTION 'REWARD_MISMATCH' USING ERRCODE='23514';END IF;
 e:=beauty.referral_reward_evidence(NEW.booking_id,a.referral_id,r.id);IF e->>'decision'<>'QUALIFIED' OR NEW.retained_net_pence IS DISTINCT FROM (e->>'net')::bigint THEN RAISE EXCEPTION 'REWARD_INELIGIBLE' USING ERRCODE='23514';END IF;
 m:=date_trunc('month',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London';
 SELECT coalesce(sum(amount_pence::bigint),0),count(*) FILTER(WHERE earner_user_id=NEW.earner_user_id AND channel=NEW.channel),count(*) FILTER(WHERE channel=NEW.channel) INTO spent,people,channel_count FROM beauty.referral_rewards WHERE created_at>=m;
 IF people>=cap_rule.person_monthly_cap OR (cap_rule.channel_monthly_cap IS NOT NULL AND channel_count>=cap_rule.channel_monthly_cap) OR spent+NEW.amount_pence>c.monthly_budget_pence THEN RAISE EXCEPTION 'REFERRAL_CAP_REACHED' USING ERRCODE='23514';END IF;
 NEW.rule_snapshot:=to_jsonb(r);RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.guard_referral_reward() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER referral_reward_guard BEFORE INSERT ON beauty.referral_rewards FOR EACH ROW EXECUTE FUNCTION beauty.guard_referral_reward();
CREATE FUNCTION beauty.guard_referral_reward_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prev text;a beauty.referral_rewards;c beauty.referral_control_versions;e jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('referral-rewards',0));SELECT * INTO STRICT a FROM beauty.referral_rewards WHERE id=NEW.reward_id;
 SELECT status INTO prev FROM beauty.referral_reward_events WHERE reward_id=a.id ORDER BY sequence DESC LIMIT 1;
 IF NOT ((prev IS NULL AND NEW.status='pending') OR (prev='pending' AND NEW.status IN ('approved','rejected','reversed')) OR (prev='approved' AND NEW.status IN ('released','rejected','reversed')) OR (prev='released' AND NEW.status='reversed')) THEN RAISE EXCEPTION 'INVALID_REWARD_TRANSITION' USING ERRCODE='23514';END IF;
 IF NEW.status IN ('approved','released') THEN
 SELECT * INTO STRICT c FROM beauty.referral_control_versions ORDER BY id DESC LIMIT 1;
 IF c.emergency_stop OR NOT c.launch_approved OR NOT (SELECT enabled FROM beauty.referral_rule_versions WHERE channel=a.channel ORDER BY created_at DESC,id DESC LIMIT 1) THEN RAISE EXCEPTION 'REWARDS_OFF' USING ERRCODE='23514';END IF;
 e:=beauty.referral_reward_evidence(a.booking_id,a.referral_id,a.rule_id);IF e->>'decision'<>'QUALIFIED' THEN RAISE EXCEPTION 'REWARD_NO_LONGER_ELIGIBLE' USING ERRCODE='23514';END IF;END IF;
 NEW.credit_delta_pence:=CASE WHEN NEW.status='released' THEN a.amount_pence WHEN NEW.status='reversed' AND prev='released' THEN -a.amount_pence ELSE 0 END;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.guard_referral_reward_event() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER referral_reward_event_guard BEFORE INSERT ON beauty.referral_reward_events FOR EACH ROW EXECUTE FUNCTION beauty.guard_referral_reward_event();
CREATE FUNCTION beauty.start_referral_reward() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN INSERT INTO beauty.referral_reward_events(reward_id,status,reason) VALUES(NEW.id,'pending','Qualified; awaiting Owner approval');RETURN NEW;END $$;
REVOKE ALL ON FUNCTION beauty.start_referral_reward() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER referral_reward_start AFTER INSERT ON beauty.referral_rewards FOR EACH ROW EXECUTE FUNCTION beauty.start_referral_reward();
CREATE FUNCTION beauty.reconcile_referral_rewards(target uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a beauty.referral_first_attribution;r beauty.referral_rule_versions;cap_rule beauty.referral_rule_versions;c beauty.referral_control_versions;existing beauty.referral_rewards;e jsonb;outcome text;sim_key text;n bigint;amount integer;live_booking boolean;live_now boolean;m timestamptz;people bigint;channels bigint;spent bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM beauty.referral_rewards WHERE booking_id=target) AND NOT EXISTS(SELECT 1 FROM beauty.referral_first_attribution f JOIN beauty.bookings b ON b.id=target JOIN beauty.professional_profiles p ON p.id=b.professional_id WHERE f.referred_user_id IN (b.customer_id,p.user_id)) THEN RETURN 'NO_ATTRIBUTION';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('referral-rewards',0));SELECT * INTO existing FROM beauty.referral_rewards WHERE booking_id=target;
 IF existing.id IS NOT NULL THEN
 e:=beauty.referral_reward_evidence(target,existing.referral_id,existing.rule_id);
 IF e->>'decision'<>'QUALIFIED' AND NOT EXISTS(SELECT 1 FROM beauty.referral_reward_events WHERE reward_id=existing.id AND status IN ('reversed','rejected')) THEN INSERT INTO beauty.referral_reward_events(reward_id,status,reason) VALUES(existing.id,'reversed',e->>'decision');END IF;RETURN 'EXISTING_REWARD';END IF;
 SELECT f.* INTO a FROM beauty.referral_first_attribution f JOIN beauty.bookings b ON b.id=target JOIN beauty.professional_profiles p ON p.id=b.professional_id
 WHERE (f.channel='professional-to-professional' AND f.referred_user_id=p.user_id) OR (f.channel<>'professional-to-professional' AND f.referred_user_id=b.customer_id) ORDER BY f.attributed_at,f.referral_id LIMIT 1;
 IF a.referral_id IS NULL THEN RETURN 'NO_ATTRIBUTION';END IF;
 SELECT coalesce((SELECT was_live FROM beauty.referral_booking_rule_snapshots WHERE booking_id=target),false) INTO live_booking;
 SELECT * INTO STRICT r FROM beauty.referral_rule_versions WHERE id=coalesce((SELECT rule_id FROM beauty.referral_booking_rule_snapshots WHERE booking_id=target AND was_live),(SELECT id FROM beauty.referral_rule_versions WHERE channel=a.channel ORDER BY created_at DESC,id DESC LIMIT 1));
 SELECT * INTO STRICT c FROM beauty.referral_control_versions ORDER BY id DESC LIMIT 1;
 SELECT * INTO STRICT cap_rule FROM beauty.referral_rule_versions WHERE channel=a.channel ORDER BY created_at DESC,id DESC LIMIT 1;
 live_now:=live_booking AND c.launch_approved AND NOT c.emergency_stop AND (SELECT enabled FROM beauty.referral_rule_versions WHERE channel=a.channel ORDER BY created_at DESC,id DESC LIMIT 1);
 e:=beauty.referral_reward_evidence(target,a.referral_id,r.id);outcome:=e->>'decision';n:=(e->>'net')::bigint;amount:=coalesce((e->>'amount')::integer,0);
 IF EXISTS(SELECT 1 FROM beauty.referral_rewards WHERE referral_id=a.referral_id) THEN outcome:='REFERRAL_ALREADY_REWARDED';END IF;
 m:=date_trunc('month',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London';
 IF outcome='QUALIFIED' THEN
 IF c.monthly_budget_pence IS NULL THEN outcome:='BUDGET_UNSET';ELSE
 IF live_now THEN SELECT count(*) FILTER(WHERE earner_user_id=a.referrer_user_id AND channel=a.channel),count(*) FILTER(WHERE channel=a.channel),coalesce(sum(amount_pence::bigint),0) INTO people,channels,spent FROM beauty.referral_rewards WHERE created_at>=m;
 ELSE
 SELECT count(*) FILTER(WHERE f.referrer_user_id=a.referrer_user_id AND f.channel=a.channel),count(*) FILTER(WHERE f.channel=a.channel),coalesce(sum(v.would_earn_pence::bigint),0) INTO people,channels,spent
 FROM (SELECT DISTINCT ON(referral_id) * FROM (SELECT DISTINCT ON(booking_id) * FROM beauty.referral_reward_simulations ORDER BY booking_id,sequence DESC) latest WHERE latest.decision='QUALIFIED' AND latest.referral_id<>a.referral_id AND evaluated_at>=m ORDER BY referral_id,sequence) v JOIN beauty.referral_first_attribution f ON f.referral_id=v.referral_id;
 END IF;
 IF people>=cap_rule.person_monthly_cap OR (cap_rule.channel_monthly_cap IS NOT NULL AND channels>=cap_rule.channel_monthly_cap) OR spent+amount>c.monthly_budget_pence THEN outcome:='CAP_REACHED';END IF;END IF;END IF;
 sim_key:=md5(jsonb_build_array(target,a.referral_id,r.id,outcome,amount,n)::text);
 IF (SELECT fingerprint FROM beauty.referral_reward_simulations WHERE booking_id=target ORDER BY sequence DESC LIMIT 1) IS DISTINCT FROM sim_key THEN INSERT INTO beauty.referral_reward_simulations(booking_id,referral_id,rule_id,decision,would_earn_pence,retained_net_pence,fingerprint) VALUES(target,a.referral_id,r.id,outcome,CASE WHEN outcome='QUALIFIED' THEN amount ELSE 0 END,n,sim_key);END IF;
 IF outcome='QUALIFIED' AND live_now THEN
 INSERT INTO beauty.referral_rewards(booking_id,referral_id,earner_user_id,channel,amount_pence,retained_net_pence,rule_id,rule_snapshot) VALUES(target,a.referral_id,a.referrer_user_id,a.channel,amount,n,r.id,to_jsonb(r));END IF;
 RETURN CASE WHEN live_now THEN outcome ELSE 'DRY_RUN:'||outcome END;
END $$;
REVOKE ALL ON FUNCTION beauty.reconcile_referral_rewards(uuid) FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker;
CREATE FUNCTION beauty.referral_reward_source_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;BEGIN
 target:=(CASE WHEN TG_TABLE_NAME='bookings' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'booking_id' END)::uuid;
 IF EXISTS(SELECT 1 FROM beauty.referral_rewards WHERE booking_id=target) THEN PERFORM beauty.reconcile_referral_rewards(target);
 ELSE BEGIN PERFORM beauty.reconcile_referral_rewards(target);EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Referral tracking pending (%)',SQLSTATE;END;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.referral_reward_source_changed() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER referral_reward_booking AFTER UPDATE OF status,completed_at ON beauty.bookings FOR EACH ROW EXECUTE FUNCTION beauty.referral_reward_source_changed();
CREATE TRIGGER referral_reward_payment AFTER UPDATE OF captured_pence,refunded_pence,status ON beauty.payments FOR EACH ROW EXECUTE FUNCTION beauty.referral_reward_source_changed();
CREATE TRIGGER referral_reward_dispute AFTER INSERT OR UPDATE OF status ON beauty.booking_disputes FOR EACH ROW EXECUTE FUNCTION beauty.referral_reward_source_changed();
CREATE FUNCTION beauty.run_referral_reward_monitor() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cursor_id uuid;target uuid;processed integer:=0;BEGIN
 SELECT last_booking_id INTO cursor_id FROM beauty.referral_monitor_cursor WHERE singleton FOR UPDATE;
 FOR target IN SELECT b.id FROM beauty.bookings b WHERE (cursor_id IS NULL OR b.id>cursor_id) AND (b.status='completed' OR EXISTS(SELECT 1 FROM beauty.referral_rewards r WHERE r.booking_id=b.id)) AND EXISTS(SELECT 1 FROM beauty.referral_first_attribution a WHERE a.referred_user_id=b.customer_id OR a.referred_user_id=(SELECT user_id FROM beauty.professional_profiles WHERE id=b.professional_id)) ORDER BY b.id LIMIT 250 LOOP
 PERFORM beauty.reconcile_referral_rewards(target);UPDATE beauty.referral_monitor_cursor SET last_booking_id=target WHERE singleton;processed:=processed+1;END LOOP;
 IF processed<250 THEN UPDATE beauty.referral_monitor_cursor SET last_booking_id=NULL WHERE singleton;END IF;RETURN processed;
END $$;
REVOKE ALL ON FUNCTION beauty.run_referral_reward_monitor() FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.run_referral_reward_monitor() TO beauty_payment_worker;
CREATE FUNCTION beauty.owner_save_referral_rule(target_channel text,amount integer,hold integer,person_cap integer,channel_cap integer,min_net integer,share_bps integer,change_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;active boolean;BEGIN actor:=beauty.require_owner();PERFORM pg_advisory_xact_lock(hashtextextended('referral-rewards',0));SELECT enabled INTO STRICT active FROM beauty.referral_rule_versions WHERE channel=target_channel ORDER BY created_at DESC,id DESC LIMIT 1;
 INSERT INTO beauty.referral_rule_versions(channel,amount_pence,hold_days,person_monthly_cap,channel_monthly_cap,minimum_net_pence,maximum_share_bps,enabled,actor_user_id,reason) VALUES(target_channel,amount,hold,person_cap,channel_cap,min_net,share_bps,active,actor,change_reason);END $$;
CREATE FUNCTION beauty.owner_referral_controls(budget bigint,stop boolean,change_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;approved boolean;BEGIN actor:=beauty.require_owner();PERFORM pg_advisory_xact_lock(hashtextextended('referral-rewards',0));SELECT launch_approved INTO STRICT approved FROM beauty.referral_control_versions ORDER BY id DESC LIMIT 1;INSERT INTO beauty.referral_control_versions(monthly_budget_pence,emergency_stop,launch_approved,actor_user_id,reason) VALUES(budget,stop,approved,actor,change_reason);IF stop THEN PERFORM beauty.stop_all_referral_channels(actor,change_reason);END IF;END $$;
CREATE FUNCTION beauty.owner_emergency_stop_referrals() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;c beauty.referral_control_versions;BEGIN actor:=beauty.require_owner();PERFORM pg_advisory_xact_lock(hashtextextended('referral-rewards',0));SELECT * INTO STRICT c FROM beauty.referral_control_versions ORDER BY id DESC LIMIT 1;INSERT INTO beauty.referral_control_versions(monthly_budget_pence,emergency_stop,launch_approved,actor_user_id,reason) VALUES(c.monthly_budget_pence,true,c.launch_approved,actor,'Owner emergency stop');PERFORM beauty.stop_all_referral_channels(actor,'Owner emergency stop');END $$;
CREATE FUNCTION beauty.owner_launch_referral_channel(target_channel text,confirmation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;r beauty.referral_rule_versions;c beauty.referral_control_versions;BEGIN
 actor:=beauty.require_owner();PERFORM pg_advisory_xact_lock(hashtextextended('referral-rewards',0));IF confirmation IS DISTINCT FROM 'I APPROVE CREDIT REWARDS FOR '||target_channel THEN RAISE EXCEPTION 'EXPLICIT_LAUNCH_APPROVAL_REQUIRED';END IF;
 SELECT * INTO STRICT r FROM beauty.referral_rule_versions WHERE channel=target_channel ORDER BY created_at DESC,id DESC LIMIT 1;SELECT * INTO STRICT c FROM beauty.referral_control_versions ORDER BY id DESC LIMIT 1;
 IF c.monthly_budget_pence IS NULL OR c.monthly_budget_pence<=0 OR r.amount_pence<=0 THEN RAISE EXCEPTION 'CONFIGURE_BUDGET_AND_AMOUNT_FIRST';END IF;
 INSERT INTO beauty.referral_rule_versions(channel,amount_pence,hold_days,person_monthly_cap,channel_monthly_cap,minimum_net_pence,maximum_share_bps,enabled,actor_user_id,reason) VALUES(r.channel,r.amount_pence,r.hold_days,r.person_monthly_cap,r.channel_monthly_cap,r.minimum_net_pence,r.maximum_share_bps,true,actor,'Explicit Owner launch approval');
 INSERT INTO beauty.referral_control_versions(monthly_budget_pence,emergency_stop,launch_approved,actor_user_id,reason) VALUES(c.monthly_budget_pence,false,true,actor,'Explicit Owner launch approval for '||target_channel);END $$;
CREATE FUNCTION beauty.owner_pause_referral_channel(target_channel text,change_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;r beauty.referral_rule_versions;BEGIN actor:=beauty.require_owner();PERFORM pg_advisory_xact_lock(hashtextextended('referral-rewards',0));SELECT * INTO STRICT r FROM beauty.referral_rule_versions WHERE channel=target_channel ORDER BY created_at DESC,id DESC LIMIT 1;
 INSERT INTO beauty.referral_rule_versions(channel,amount_pence,hold_days,person_monthly_cap,channel_monthly_cap,minimum_net_pence,maximum_share_bps,enabled,actor_user_id,reason) VALUES(r.channel,r.amount_pence,r.hold_days,r.person_monthly_cap,r.channel_monthly_cap,r.minimum_net_pence,r.maximum_share_bps,false,actor,change_reason);END $$;
CREATE FUNCTION beauty.owner_referral_reward_decision(target uuid,next_status text,decision_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN actor:=beauty.require_owner();IF next_status NOT IN ('approved','released','rejected','reversed') OR next_status IS NULL THEN RAISE EXCEPTION 'INVALID_DECISION';END IF;INSERT INTO beauty.referral_reward_events(reward_id,status,actor_user_id,reason) VALUES(target,next_status,actor,decision_reason);END $$;
CREATE FUNCTION beauty.owner_referral_risk_decision(target uuid,next_status text,decision_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN actor:=beauty.require_owner();PERFORM pg_advisory_xact_lock(hashtextextended('referral-rewards',0));INSERT INTO beauty.referral_risk_decisions(case_id,status,actor_user_id,reason) VALUES(target,next_status,actor,decision_reason);END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname IN ('owner_save_referral_rule','owner_referral_controls','owner_emergency_stop_referrals','owner_launch_referral_channel','owner_pause_referral_channel','owner_referral_reward_decision','owner_referral_risk_decision') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO beauty_app',f.signature);END LOOP;END $$;

CREATE FUNCTION beauty.stop_all_referral_channels(actor uuid,change_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO beauty.referral_rule_versions(channel,amount_pence,hold_days,person_monthly_cap,channel_monthly_cap,minimum_net_pence,maximum_share_bps,enabled,actor_user_id,reason)
 SELECT channel,amount_pence,hold_days,person_monthly_cap,channel_monthly_cap,minimum_net_pence,maximum_share_bps,false,actor,left('Emergency stop: '||change_reason,500)
 FROM(SELECT DISTINCT ON(channel) * FROM beauty.referral_rule_versions ORDER BY channel,created_at DESC,id DESC)r WHERE enabled;
END $$;
REVOKE ALL ON FUNCTION beauty.stop_all_referral_channels(uuid,text) FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker;

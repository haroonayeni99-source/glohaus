-- Salted hashes only: no raw IP, device, card, phone or address is retained here.
CREATE TABLE beauty.referral_signal_secret(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),value text NOT NULL);
INSERT INTO beauty.referral_signal_secret(value) VALUES(gen_random_uuid()::text||gen_random_uuid()::text);
CREATE TABLE beauty.referral_security_signals(user_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('device','phone','email_pattern','payment_card','address','ip')),value_hash text NOT NULL CHECK(length(value_hash)=64),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,kind,value_hash));
CREATE INDEX referral_signal_match ON beauty.referral_security_signals(kind,value_hash,user_id);
ALTER TABLE beauty.referral_signal_secret ENABLE ROW LEVEL SECURITY;ALTER TABLE beauty.referral_signal_secret FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.referral_security_signals ENABLE ROW LEVEL SECURITY;ALTER TABLE beauty.referral_security_signals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty.referral_signal_secret,beauty.referral_security_signals FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker;
CREATE FUNCTION beauty.detect_referral_signal_overlaps(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO beauty.referral_risk_cases(referral_id,reason,evidence_key)
 SELECT DISTINCT a.referral_id,s.kind,s.value_hash FROM beauty.referral_first_attribution a
 JOIN beauty.referral_security_signals s ON s.user_id=a.referrer_user_id JOIN beauty.referral_security_signals n ON n.user_id=a.referred_user_id AND n.kind=s.kind AND n.value_hash=s.value_hash
 WHERE a.referrer_user_id=target OR a.referred_user_id=target ON CONFLICT(referral_id,reason,evidence_key) DO NOTHING;
 -- A supposedly new customer matching a previously paying account is reviewed
 -- even when that old account is not the referrer. Include new-pro customers.
 INSERT INTO beauty.referral_risk_cases(referral_id,reason,evidence_key)
 SELECT DISTINCT subjects.referral_id,'linked_account',s.kind||':'||s.value_hash FROM (
 SELECT referral_id,referred_user_id subject FROM beauty.referral_first_attribution
 UNION SELECT a.referral_id,b.customer_id FROM beauty.referral_first_attribution a JOIN beauty.professional_profiles p ON p.user_id=a.referred_user_id JOIN beauty.bookings b ON b.professional_id=p.id WHERE a.channel='professional-to-professional'
 ) subjects JOIN beauty.referral_security_signals s ON s.user_id=subjects.subject
 JOIN beauty.referral_security_signals old ON old.kind=s.kind AND old.value_hash=s.value_hash AND old.user_id<>s.user_id
 WHERE (subjects.subject=target OR old.user_id=target) AND EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id WHERE b.customer_id=old.user_id AND p.captured_pence>0)
 ON CONFLICT(referral_id,reason,evidence_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION beauty.detect_referral_signal_overlaps(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.record_referral_security_signal(target uuid,signal_kind text,raw_value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE normalized text;salt text;BEGIN
 IF raw_value IS NULL OR length(trim(raw_value))=0 OR length(raw_value)>2048 THEN RETURN;END IF;
 IF signal_kind='email_pattern' THEN
 normalized:=lower(trim(raw_value));IF normalized NOT LIKE '%@%' THEN RETURN;END IF;
 normalized:=split_part(split_part(normalized,'@',1),'+',1)||'@'||split_part(normalized,'@',2);
 IF split_part(normalized,'@',2) IN ('gmail.com','googlemail.com') THEN normalized:=replace(split_part(normalized,'@',1),'.','')||'@gmail.com';END IF;
 ELSIF signal_kind='phone' THEN normalized:=regexp_replace(raw_value,'[^0-9]','','g');normalized:=regexp_replace(normalized,'^00','');IF length(normalized)<7 THEN RETURN;END IF;
 ELSIF signal_kind='address' THEN normalized:=regexp_replace(lower(raw_value),'[^a-z0-9]','','g');IF length(normalized)<8 THEN RETURN;END IF;
 ELSIF signal_kind='ip' THEN BEGIN normalized:=(raw_value::inet)::text;EXCEPTION WHEN invalid_text_representation THEN RETURN;END;
 ELSIF signal_kind IN ('device','payment_card') THEN normalized:=trim(raw_value);ELSE RAISE EXCEPTION 'INVALID_SIGNAL_KIND';END IF;
 SELECT value INTO STRICT salt FROM beauty.referral_signal_secret WHERE singleton;
 INSERT INTO beauty.referral_security_signals(user_id,kind,value_hash) VALUES(target,signal_kind,encode(sha256(convert_to(salt||':'||signal_kind||':'||normalized,'UTF8')),'hex')) ON CONFLICT DO NOTHING;
 PERFORM beauty.detect_referral_signal_overlaps(target);
END $$;
REVOKE ALL ON FUNCTION beauty.record_referral_security_signal(uuid,text,text) FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker;
CREATE FUNCTION beauty.record_my_referral_security(device text,ip_address text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;telephone text;BEGIN
 SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active' AND deleted_at IS NULL;IF actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF device~'^[0-9a-f-]{36}$' THEN PERFORM beauty.record_referral_security_signal(actor,'device',device);END IF;
 PERFORM beauty.record_referral_security_signal(actor,'ip',ip_address);
 SELECT phone INTO telephone FROM auth.users WHERE id::text=beauty.auth_id() AND phone_confirmed_at IS NOT NULL;
 PERFORM beauty.record_referral_security_signal(actor,'phone',telephone);PERFORM beauty.record_referral_security_signal(actor,'email_pattern',(SELECT email FROM beauty.users WHERE id=actor));
END $$;
REVOKE ALL ON FUNCTION beauty.record_my_referral_security(text,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION beauty.record_my_referral_security(text,text) TO beauty_app;
CREATE FUNCTION beauty.record_booking_referral_security(target_booking uuid,intent text,card_fingerprint text,billing_address text,billing_phone text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN
 SELECT b.customer_id INTO actor FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id WHERE b.id=target_booking AND p.stripe_payment_intent_id=intent AND p.captured_pence>0;IF actor IS NULL THEN RAISE EXCEPTION 'PAYMENT_MISMATCH';END IF;
 PERFORM beauty.record_referral_security_signal(actor,'payment_card',card_fingerprint);PERFORM beauty.record_referral_security_signal(actor,'address',billing_address);PERFORM beauty.record_referral_security_signal(actor,'phone',billing_phone);
END $$;
REVOKE ALL ON FUNCTION beauty.record_booking_referral_security(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,beauty_app;GRANT EXECUTE ON FUNCTION beauty.record_booking_referral_security(uuid,text,text,text,text) TO beauty_payment_worker;
CREATE FUNCTION beauty.referral_security_account_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM beauty.record_referral_security_signal(NEW.id,'email_pattern',NEW.email);RETURN NEW;END $$;
REVOKE ALL ON FUNCTION beauty.referral_security_account_changed() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER referral_security_account AFTER INSERT OR UPDATE OF email ON beauty.users FOR EACH ROW EXECUTE FUNCTION beauty.referral_security_account_changed();
CREATE FUNCTION beauty.referral_security_attributed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM beauty.detect_referral_signal_overlaps(NEW.referred_user_id);RETURN NEW;END $$;
REVOKE ALL ON FUNCTION beauty.referral_security_attributed() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER referral_security_attributed AFTER INSERT ON beauty.referral_first_attribution FOR EACH ROW EXECUTE FUNCTION beauty.referral_security_attributed();
CREATE FUNCTION beauty.referral_risk_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE attribution uuid;target uuid;BEGIN
 IF TG_TABLE_NAME='referral_risk_cases' THEN attribution:=(to_jsonb(NEW)->>'referral_id')::uuid;ELSE SELECT referral_id INTO attribution FROM beauty.referral_risk_cases WHERE id=(to_jsonb(NEW)->>'case_id')::uuid;END IF;
 FOR target IN SELECT booking_id FROM beauty.referral_rewards WHERE referral_id=attribution UNION SELECT booking_id FROM beauty.referral_reward_simulations WHERE referral_id=attribution LOOP PERFORM beauty.reconcile_referral_rewards(target);END LOOP;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.referral_risk_changed() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER referral_risk_changed AFTER INSERT ON beauty.referral_risk_cases FOR EACH ROW EXECUTE FUNCTION beauty.referral_risk_changed();CREATE TRIGGER referral_risk_decided AFTER INSERT ON beauty.referral_risk_decisions FOR EACH ROW EXECUTE FUNCTION beauty.referral_risk_changed();
DO $$ DECLARE u record;BEGIN FOR u IN SELECT id,email FROM beauty.users LOOP PERFORM beauty.record_referral_security_signal(u.id,'email_pattern',u.email);END LOOP;END $$;

-- New canonical account codes; legacy GC/GH links remain valid aliases.
CREATE TABLE beauty.referral_account_codes(user_id uuid PRIMARY KEY,code text NOT NULL UNIQUE DEFAULT('GR'||upper(replace(gen_random_uuid()::text,'-',''))) CHECK(code~'^GR[A-F0-9]{32}$'),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE beauty.referral_partners(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),label text NOT NULL CHECK(length(label) BETWEEN 2 AND 150),kind text NOT NULL CHECK(kind IN ('brand_ambassador','student_ambassador','beauty_academy','other')),credit_user_id uuid NOT NULL REFERENCES beauty.users(id),code text NOT NULL UNIQUE DEFAULT('GP'||upper(replace(gen_random_uuid()::text,'-',''))) CHECK(code~'^GP[A-F0-9]{32}$'),created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE beauty.referral_signup_intents(auth_id uuid PRIMARY KEY,referrer_user_id uuid NOT NULL,code text NOT NULL,channel text NOT NULL CHECK(channel IN ('customer','professional-to-professional','professional-introducing-own-customer','manual-partner')),signed_up_at timestamptz NOT NULL);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['referral_account_codes','referral_partners','referral_signup_intents'] LOOP
 EXECUTE format('ALTER TABLE beauty.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE beauty.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON beauty.%I FROM PUBLIC,anon,authenticated,beauty_app',t);
 EXECUTE format('CREATE TRIGGER referral_append_only BEFORE UPDATE OR DELETE ON beauty.%I FOR EACH ROW EXECUTE FUNCTION beauty.referral_attribution_immutable()',t);EXECUTE format('CREATE TRIGGER referral_no_truncate BEFORE TRUNCATE ON beauty.%I FOR EACH STATEMENT EXECUTE FUNCTION beauty.referral_attribution_immutable()',t);
 END LOOP;END $$;
INSERT INTO beauty.referral_account_codes(user_id) SELECT id FROM beauty.users;
CREATE FUNCTION beauty.resolve_referral_code(input_code text,input_channel text) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source uuid;BEGIN
 IF input_code IS NULL OR input_channel IS NULL OR length(input_code)>40 THEN RETURN NULL;END IF;
 IF input_channel='manual-partner' THEN SELECT credit_user_id INTO source FROM beauty.referral_partners WHERE code=input_code;
 ELSE SELECT user_id INTO source FROM beauty.referral_account_codes WHERE code=input_code;
 IF source IS NULL AND input_channel='customer' THEN SELECT user_id INTO source FROM beauty.customer_referral_codes WHERE code=input_code;END IF;
 IF source IS NULL AND input_channel IN ('professional-to-professional','professional-introducing-own-customer') THEN SELECT p.user_id INTO source FROM beauty.professional_referral_codes c JOIN beauty.professional_profiles p ON p.id=c.professional_id WHERE c.code=input_code;END IF;END IF;
 IF NOT EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=source AND u.status='active' AND u.deleted_at IS NULL AND (u.restricted_until IS NULL OR u.restricted_until<=now())) THEN RETURN NULL;END IF;
 IF input_channel IN ('professional-to-professional','professional-introducing-own-customer') AND NOT EXISTS(SELECT 1 FROM beauty.professional_profiles WHERE user_id=source) THEN RETURN NULL;END IF;
 IF input_channel='customer' AND NOT EXISTS(SELECT 1 FROM beauty.user_roles WHERE user_id=source AND role='customer') THEN RETURN NULL;END IF;
 IF input_channel NOT IN ('customer','professional-to-professional','professional-introducing-own-customer','manual-partner') THEN RETURN NULL;END IF;RETURN source;
END $$;
REVOKE ALL ON FUNCTION beauty.resolve_referral_code(text,text) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE FUNCTION beauty.capture_auth_referral() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE code text;channel text;source uuid;BEGIN
 code:=upper(trim(NEW.raw_user_meta_data->'glohaus_referral'->>'code'));channel:=NEW.raw_user_meta_data->'glohaus_referral'->>'channel';source:=beauty.resolve_referral_code(code,channel);
 IF source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=source AND lower(trim(u.email))=lower(trim(NEW.email))) THEN
 INSERT INTO beauty.referral_signup_intents(auth_id,referrer_user_id,code,channel,signed_up_at) VALUES(NEW.id,source,code,channel,NEW.created_at) ON CONFLICT(auth_id) DO NOTHING;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.capture_auth_referral() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER glohaus_capture_referral AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION beauty.capture_auth_referral();
CREATE FUNCTION beauty.initialise_account_referral() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO beauty.referral_account_codes(user_id) VALUES(NEW.id);
 INSERT INTO beauty.referral_first_attribution(referred_user_id,referrer_user_id,referral_id,channel,code,attributed_at)
 SELECT NEW.id,s.referrer_user_id,gen_random_uuid(),s.channel,s.code,s.signed_up_at FROM beauty.referral_signup_intents s WHERE s.auth_id::text=NEW.auth_id AND s.referrer_user_id<>NEW.id ON CONFLICT(referred_user_id) DO NOTHING;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.initialise_account_referral() FROM PUBLIC,anon,authenticated,beauty_app;
CREATE TRIGGER glohaus_initialise_referral AFTER INSERT ON beauty.users FOR EACH ROW EXECUTE FUNCTION beauty.initialise_account_referral();
-- Keep this deployed function's existing argument name; post-signup claims are retired.
CREATE OR REPLACE FUNCTION beauty.claim_customer_referral(submitted_code text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION beauty.claim_customer_referral(text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION beauty.claim_customer_referral(text) TO beauty_app;
CREATE FUNCTION beauty.referral_has_genuine_booking(attribution uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM beauty.referral_first_attribution f JOIN beauty.bookings b ON ((f.channel='professional-to-professional' AND f.referred_user_id=(SELECT user_id FROM beauty.professional_profiles WHERE id=b.professional_id)) OR (f.channel<>'professional-to-professional' AND f.referred_user_id=b.customer_id))
 JOIN LATERAL(SELECT id FROM beauty.referral_rule_versions WHERE channel=f.channel ORDER BY created_at DESC,id DESC LIMIT 1)r ON true
 WHERE f.referral_id=attribution AND beauty.referral_reward_evidence(b.id,f.referral_id,r.id)->>'decision' IN ('QUALIFIED','PENDING_ACTUAL_COSTS','NET_BELOW_MINIMUM','SHARE_LIMIT','AMOUNT_UNSET'))
$$;
REVOKE ALL ON FUNCTION beauty.referral_has_genuine_booking(uuid) FROM PUBLIC,anon,authenticated,beauty_app;
CREATE OR REPLACE FUNCTION beauty.my_customer_referrals() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN SELECT id INTO actor FROM beauty.users WHERE auth_id=beauty.auth_id() AND status='active' AND deleted_at IS NULL;IF actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('code',(SELECT code FROM beauty.referral_account_codes WHERE user_id=actor),'totalReferrals',(SELECT count(*) FROM beauty.referral_first_attribution WHERE referrer_user_id=actor AND channel='customer'),'rewardsEnabled',false);END $$;
REVOKE ALL ON FUNCTION beauty.my_customer_referrals() FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION beauty.my_customer_referrals() TO beauty_app;
CREATE OR REPLACE FUNCTION beauty.my_professional_referral_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN SELECT u.id INTO actor FROM beauty.users u JOIN beauty.professional_profiles p ON p.user_id=u.id WHERE u.auth_id=beauty.auth_id() AND u.status='active' AND u.deleted_at IS NULL;IF actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('code',(SELECT code FROM beauty.referral_account_codes WHERE user_id=actor),'totalReferrals',(SELECT count(*) FROM beauty.referral_first_attribution WHERE referrer_user_id=actor),'qualifiedReferrals',(SELECT count(*) FROM beauty.referral_first_attribution WHERE referrer_user_id=actor AND beauty.referral_has_genuine_booking(referral_id)),'rewardsEnabled',false);END $$;
REVOKE ALL ON FUNCTION beauty.my_professional_referral_overview() FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION beauty.my_professional_referral_overview() TO beauty_app;
CREATE FUNCTION beauty.owner_create_referral_partner(partner_label text,partner_kind text,credit_recipient uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;result text;BEGIN actor:=beauty.require_owner();IF NOT EXISTS(SELECT 1 FROM beauty.users WHERE id=credit_recipient AND status='active' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'ACTIVE_CREDIT_RECIPIENT_REQUIRED';END IF;
 INSERT INTO beauty.referral_partners(label,kind,credit_user_id,created_by) VALUES(partner_label,partner_kind,credit_recipient,actor) RETURNING code INTO result;RETURN result;END $$;
REVOKE ALL ON FUNCTION beauty.owner_create_referral_partner(text,text,uuid) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION beauty.owner_create_referral_partner(text,text,uuid) TO beauty_app;

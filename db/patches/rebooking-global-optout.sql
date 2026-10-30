-- Candidate follow-up to scoped controls. Global unsubscribe revokes existing
-- named permissions and waiting work; a later global opt-in cannot revive them.
CREATE FUNCTION beauty.rebooking_global_optout() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO beauty.rebooking_scope_events(actor_user_id,professional_id,kind,details)
 SELECT NEW.user_id,c.professional_id,'customer_consent',jsonb_build_object('channel',c.channel,'enabled',false,'consentVersion',c.consent_version,'source','global_opt_out')
 FROM beauty.rebooking_customer_consents c WHERE c.user_id=NEW.user_id AND c.enabled;
 UPDATE beauty.rebooking_customer_consents SET enabled=false,updated_at=now() WHERE user_id=NEW.user_id AND enabled;
 UPDATE beauty.rebooking_outbox SET state='suppressed',claimed_until=NULL WHERE recipient_user_id=NEW.user_id AND state='pending';
 RETURN NEW;
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.rebooking_global_optout() OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.rebooking_global_optout() FROM PUBLIC,anon,authenticated,beauty_app,beauty_payment_worker;
CREATE TRIGGER rebooking_global_optout AFTER UPDATE OF rebooking ON beauty.marketing_preferences
FOR EACH ROW WHEN(OLD.rebooking AND NOT NEW.rebooking) EXECUTE FUNCTION beauty.rebooking_global_optout();

-- Unsubscribe must revoke scoped permissions even when the global setting
-- was already off (a named choice can be saved while that master is off).
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='beauty.marketing_preferences'::regclass AND tgname='rebooking_global_optout' AND tgfoid='beauty.rebooking_global_optout()'::regprocedure AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'Expected scoped global unsubscribe trigger is missing';
 END IF;
END $$;
CREATE OR REPLACE TRIGGER rebooking_global_optout AFTER UPDATE OF rebooking ON beauty.marketing_preferences
FOR EACH ROW WHEN(NOT NEW.rebooking) EXECUTE FUNCTION beauty.rebooking_global_optout();

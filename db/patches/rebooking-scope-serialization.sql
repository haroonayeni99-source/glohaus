-- Queue creation already holds this advisory lock. Scope withdrawal/pause
-- must wait for that queue transaction before suppressing its waiting work.
DO $patch$
DECLARE signature regprocedure;fn text;updated_fn text;BEGIN
 FOREACH signature IN ARRAY ARRAY['beauty.set_my_rebooking_consent(uuid,text,boolean)'::regprocedure,'beauty.set_my_professional_rebooking(jsonb)'::regprocedure] LOOP
  SELECT pg_get_functiondef(signature) INTO fn;
  IF position('BEGIN actor:=beauty.rebooking_scope_actor();' IN fn)=0 THEN RAISE EXCEPTION 'Unexpected scoped write definition: %',signature;END IF;
  updated_fn:=replace(fn,'BEGIN actor:=beauty.rebooking_scope_actor();',$new$BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('glohaus-rebooking-pilot',0));actor:=beauty.rebooking_scope_actor();$new$);
  EXECUTE updated_fn;
 END LOOP;
 SELECT pg_get_functiondef('beauty.rebooking_global_optout()'::regprocedure) INTO fn;
 IF position(E'BEGIN\n INSERT INTO beauty.rebooking_scope_events' IN fn)=0 THEN RAISE EXCEPTION 'Unexpected global opt-out definition';END IF;
 updated_fn:=replace(fn,E'BEGIN\n INSERT INTO beauty.rebooking_scope_events',$new$BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('glohaus-rebooking-pilot',0));
 INSERT INTO beauty.rebooking_scope_events$new$);
 EXECUTE updated_fn;
END $patch$;

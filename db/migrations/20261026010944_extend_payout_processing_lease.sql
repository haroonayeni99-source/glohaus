-- Stripe calls have bounded retries; the container can outlive a short
-- serverless request. Keep a slow handler's reservation exclusively claimed
-- for the full processing budget. This changes no earnings-release or bank date.
SET LOCAL lock_timeout = '5s';
DO $$ DECLARE definition text; needle text:='interval ''2 minutes'''; BEGIN
 definition:=pg_get_functiondef('beauty.request_my_payout_once(text,integer,uuid,uuid)'::regprocedure);
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>2 THEN
  RAISE EXCEPTION 'Payout lease definition needs separate review';
 END IF;
 EXECUTE replace(definition,needle,'interval ''15 minutes''');
END $$;

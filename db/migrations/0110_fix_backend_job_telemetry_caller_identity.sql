-- Fix backend job telemetry caller identity.
-- SECURITY DEFINER changes current_user to the function owner, so the previous
-- worker-role check could never pass. Run as SECURITY INVOKER instead and keep
-- table/function privileges limited to beauty_payment_worker.

CREATE OR REPLACE FUNCTION beauty.record_backend_job_run(
  target_job text,
  was_successful boolean,
  run_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog
AS $$
BEGIN
  IF current_user <> 'beauty_payment_worker' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF target_job NOT IN('maintenance','notifications') THEN
    RAISE EXCEPTION 'INVALID_JOB' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.backend_job_runs(job_name,succeeded,details)
  VALUES(target_job,was_successful,coalesce(run_details,'{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION beauty.record_backend_job_run(text,boolean,jsonb)
FROM PUBLIC,anon,authenticated,beauty_app;
GRANT EXECUTE ON FUNCTION beauty.record_backend_job_run(text,boolean,jsonb)
TO beauty_payment_worker;
GRANT USAGE,SELECT ON SEQUENCE beauty.backend_job_runs_id_seq
TO beauty_payment_worker;

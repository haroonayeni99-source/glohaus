-- Durable backend worker health telemetry for maintenance and notification crons.

CREATE TABLE IF NOT EXISTS beauty.backend_job_runs(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name text NOT NULL CHECK(job_name IN('maintenance','notifications')),
  succeeded boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backend_job_runs_job_created_idx
  ON beauty.backend_job_runs(job_name,created_at DESC);

ALTER TABLE beauty.backend_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.backend_job_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE beauty.backend_job_runs FROM PUBLIC,anon,authenticated,beauty_app;
GRANT SELECT,INSERT ON beauty.backend_job_runs TO beauty_payment_worker;

CREATE OR REPLACE FUNCTION beauty.record_backend_job_run(
  target_job text,
  was_successful boolean,
  run_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION beauty.owner_backend_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  PERFORM beauty.require_owner();
  RETURN jsonb_build_object(
    'jobs', jsonb_build_object(
      'maintenance', jsonb_build_object(
        'lastSuccessAt',(SELECT max(created_at) FROM beauty.backend_job_runs WHERE job_name='maintenance' AND succeeded),
        'lastFailureAt',(SELECT max(created_at) FROM beauty.backend_job_runs WHERE job_name='maintenance' AND NOT succeeded),
        'failures24h',(SELECT count(*)::integer FROM beauty.backend_job_runs WHERE job_name='maintenance' AND NOT succeeded AND created_at>=now()-interval '24 hours')
      ),
      'notifications', jsonb_build_object(
        'lastSuccessAt',(SELECT max(created_at) FROM beauty.backend_job_runs WHERE job_name='notifications' AND succeeded),
        'lastFailureAt',(SELECT max(created_at) FROM beauty.backend_job_runs WHERE job_name='notifications' AND NOT succeeded),
        'failures24h',(SELECT count(*)::integer FROM beauty.backend_job_runs WHERE job_name='notifications' AND NOT succeeded AND created_at>=now()-interval '24 hours')
      )
    ),
    'queues', jsonb_build_object(
      'bookingEmailPending',(SELECT count(*)::integer FROM beauty.notification_outbox WHERE sent_at IS NULL AND attempts<5),
      'bookingEmailExhausted',(SELECT count(*)::integer FROM beauty.notification_outbox WHERE sent_at IS NULL AND attempts>=5),
      'productEmailPending',(SELECT count(*)::integer FROM beauty.product_notification_outbox WHERE sent_at IS NULL AND attempts<5),
      'productEmailExhausted',(SELECT count(*)::integer FROM beauty.product_notification_outbox WHERE sent_at IS NULL AND attempts>=5),
      'marketingPending',(SELECT count(*)::integer FROM beauty.marketing_outbox WHERE sent_at IS NULL AND attempts<5),
      'marketingExhausted',(SELECT count(*)::integer FROM beauty.marketing_outbox WHERE sent_at IS NULL AND attempts>=5)
    )
  );
END;
$$;

ALTER FUNCTION beauty.record_backend_job_run(text,boolean,jsonb) OWNER TO postgres;
ALTER FUNCTION beauty.owner_backend_health() OWNER TO postgres;

REVOKE ALL ON FUNCTION beauty.record_backend_job_run(text,boolean,jsonb),
  beauty.owner_backend_health()
FROM PUBLIC,anon,authenticated,beauty_app;

GRANT EXECUTE ON FUNCTION beauty.record_backend_job_run(text,boolean,jsonb)
  TO beauty_payment_worker;
GRANT EXECUTE ON FUNCTION beauty.owner_backend_health()
  TO beauty_app;

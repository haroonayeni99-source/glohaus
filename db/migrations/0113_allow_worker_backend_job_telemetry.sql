-- Permit only the payment worker to append backend job telemetry through RLS.
DROP POLICY IF EXISTS backend_job_runs_worker_insert ON beauty.backend_job_runs;
CREATE POLICY backend_job_runs_worker_insert
ON beauty.backend_job_runs
FOR INSERT
TO beauty_payment_worker
WITH CHECK (
  job_name IN ('maintenance','notifications')
  AND jsonb_typeof(details)='object'
);
REVOKE SELECT ON beauty.backend_job_runs FROM beauty_payment_worker;

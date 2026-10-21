-- Run through Supabase SQL after growth_event_reconciliation migration is applied.
-- Platform pg_cron module must be enabled first in Supabase Integrations > Cron.
-- Database-only operation. No HTTP endpoint, secrets, or payout access.
SELECT cron.schedule('glohaus-growth-reconciliation-hourly',
  '0 * * * *',
  'SELECT beauty.growth_reconcile_all()');
-- Confirm the job and inspect execution history:
-- SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='glohaus-growth-reconciliation-hourly';
-- SELECT status,return_message,start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

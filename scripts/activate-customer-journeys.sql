-- One-off, explicitly authorised deployment configuration, not a schema migration.
-- Execute with the administrative deployment connection after release checks pass.
-- No identity/MFA claims are fabricated; this is recorded as an operator action.
-- Google routing and GPS arrival tools remain independently controlled.
BEGIN;
SELECT pg_advisory_xact_lock(74201837);
DO $$
DECLARE previous beauty.arrival_settings; owner_id uuid;
BEGIN
  SELECT * INTO STRICT previous FROM beauty.arrival_settings FOR UPDATE;
  IF previous.scheduler_tick_at IS NULL OR previous.scheduler_tick_at < now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'ARRIVAL_SCHEDULER_NOT_READY';
  END IF;
  SELECT r.user_id INTO STRICT owner_id FROM beauty.user_roles r
    JOIN beauty.users u ON u.id=r.user_id WHERE r.role='owner' AND u.status='active';
  IF previous.journey_planner AND previous.departure_reminders THEN RETURN; END IF;
  UPDATE beauty.arrival_settings SET journey_planner=true, departure_reminders=true, updated_at=now();
  INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,target_type,reason,metadata)
  VALUES('codex:authorised-deployment:2026-10-18','arrival.settings',owner_id,'arrival',
    'Haroon authorised customer journey planning and opt-in departure reminders in the 18 October 2026 completion request.',
    jsonb_build_object('operator',session_user,'source','scripts/activate-customer-journeys.sql',
      'before',jsonb_build_object('journeyPlanner',previous.journey_planner,'departureReminders',previous.departure_reminders),
      'after',jsonb_build_object('journeyPlanner',true,'departureReminders',true),
      'routingChanged',false,'customerConsentChanged',false));
END $$;
COMMIT;

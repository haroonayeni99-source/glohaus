-- Execute through the administrative deployment connection only after all three
-- live provider diagnostics pass on the exact released source and environment.
-- Do not set app.auth_id or manufacture an Owner/MFA session for this operation.
BEGIN;
SELECT pg_advisory_xact_lock(74201837);
DO $$
DECLARE previous beauty.arrival_settings; owner_id uuid;
BEGIN
  SELECT * INTO STRICT previous FROM beauty.arrival_settings FOR UPDATE;
  IF NOT previous.journey_planner OR NOT previous.departure_reminders OR
     previous.scheduler_tick_at IS NULL OR previous.scheduler_tick_at < now()-interval '2 minutes' THEN
    RAISE EXCEPTION 'JOURNEY_ACTIVATION_NOT_READY';
  END IF;
  SELECT r.user_id INTO STRICT owner_id FROM beauty.user_roles r
    JOIN beauty.users u ON u.id=r.user_id WHERE r.role='owner' AND u.status='active';
  IF previous.routing_enabled THEN RETURN; END IF;
  UPDATE beauty.arrival_settings SET routing_enabled=true,updated_at=now();
  INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,target_type,reason,metadata)
  VALUES('codex:google-routing-activation:2026-10-19','journey.routing.settings',owner_id,'arrival',
    'Haroon authorised Google Routes activation after adding the server credential; driving, walking and transit live diagnostics passed.',
    jsonb_build_object('operator',session_user,'source','scripts/activate-google-routing.sql',
      'before',jsonb_build_object('enabled',previous.routing_enabled),
      'after',jsonb_build_object('enabled',true),'limitsChanged',false,'customerConsentChanged',false));
END $$;
COMMIT;

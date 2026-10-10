-- Fix Resend provider event reconciliation by qualifying the function argument
-- that shares a name with beauty.notification_outbox.provider_event_at.
DO $$
DECLARE
  ddl text;
  original text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO original
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'beauty'
    AND p.proname = 'record_email_provider_event'
    AND pg_get_function_identity_arguments(p.oid) =
      'provider_event_id text, provider_id text, provider_event_type text, provider_event_at timestamp with time zone, recipient_email text';

  IF original IS NULL THEN
    RAISE EXCEPTION 'beauty.record_email_provider_event not found';
  END IF;

  ddl := replace(
    original,
    'coalesce(provider_event_at,now())',
    'coalesce(record_email_provider_event.provider_event_at,now())'
  );

  IF ddl = original THEN
    -- Already fixed: keep the migration idempotent.
    RETURN;
  END IF;

  EXECUTE ddl;
END $$;

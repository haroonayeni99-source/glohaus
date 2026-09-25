-- Private customer/professional messaging foundation.
-- Reads are participant-scoped by RLS. Writes happen only through narrowly
-- scoped SECURITY DEFINER functions owned by a non-login role.
CREATE ROLE beauty_messaging_ops NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT beauty_messaging_ops TO postgres;
GRANT USAGE ON SCHEMA beauty TO beauty_messaging_ops;
GRANT EXECUTE ON FUNCTION beauty.auth_id() TO beauty_messaging_ops;

CREATE TABLE beauty.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES beauty.users(id),
  professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  customer_read_at timestamptz,
  professional_read_at timestamptz,
  UNIQUE(customer_id, professional_id)
);

CREATE INDEX conversations_customer_recent
  ON beauty.conversations(customer_id,last_message_at DESC,id DESC);
CREATE INDEX conversations_professional_recent
  ON beauty.conversations(professional_id,last_message_at DESC,id DESC);

CREATE TABLE beauty.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES beauty.conversations(id),
  sender_user_id uuid NOT NULL REFERENCES beauty.users(id),
  booking_id uuid REFERENCES beauty.bookings(id),
  body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_recent
  ON beauty.messages(conversation_id,created_at DESC,id DESC);
CREATE INDEX messages_sender_rate
  ON beauty.messages(sender_user_id,created_at DESC);

ALTER TABLE beauty.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.messages FORCE ROW LEVEL SECURITY;

CREATE POLICY conversation_participant_read ON beauty.conversations
FOR SELECT TO beauty_app
USING (
  EXISTS(
    SELECT 1 FROM beauty.users u
    WHERE u.id=customer_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
  OR EXISTS(
    SELECT 1
    FROM beauty.professional_profiles p
    JOIN beauty.users u ON u.id=p.user_id
    WHERE p.id=professional_id
      AND u.auth_id=beauty.auth_id()
      AND u.status='active'
  )
);

CREATE POLICY message_participant_read ON beauty.messages
FOR SELECT TO beauty_app
USING (
  EXISTS(
    SELECT 1
    FROM beauty.conversations c
    WHERE c.id=conversation_id
  )
);

GRANT SELECT ON beauty.conversations, beauty.messages TO beauty_app;

-- The function owner has only the data access required to validate participants,
-- booking context and rate limits.
GRANT SELECT ON beauty.users,beauty.user_roles,beauty.professional_profiles,beauty.bookings
  TO beauty_messaging_ops;
GRANT SELECT,INSERT,UPDATE ON beauty.conversations TO beauty_messaging_ops;
GRANT SELECT,INSERT ON beauty.messages TO beauty_messaging_ops;

CREATE POLICY messaging_ops_users ON beauty.users
FOR SELECT TO beauty_messaging_ops USING(true);
CREATE POLICY messaging_ops_roles ON beauty.user_roles
FOR SELECT TO beauty_messaging_ops USING(true);
CREATE POLICY messaging_ops_profiles ON beauty.professional_profiles
FOR SELECT TO beauty_messaging_ops USING(true);
CREATE POLICY messaging_ops_bookings ON beauty.bookings
FOR SELECT TO beauty_messaging_ops USING(true);
CREATE POLICY messaging_ops_conversations ON beauty.conversations
FOR ALL TO beauty_messaging_ops USING(true) WITH CHECK(true);
CREATE POLICY messaging_ops_messages ON beauty.messages
FOR ALL TO beauty_messaging_ops USING(true) WITH CHECK(true);

CREATE FUNCTION beauty.message_professional(
  target_professional uuid,
  message_body text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor beauty.users;
  target beauty.professional_profiles;
  conversation_id uuid;
  message_id uuid;
  clean_body text;
BEGIN
  clean_body:=trim(message_body);
  IF clean_body IS NULL OR length(clean_body) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE' USING ERRCODE='22023';
  END IF;

  SELECT u.* INTO actor
  FROM beauty.users u
  JOIN beauty.user_roles r ON r.user_id=u.id AND r.role='customer'
  WHERE u.auth_id=beauty.auth_id() AND u.status='active';
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT p.* INTO target
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  WHERE p.id=target_professional
    AND p.publication_status='published'
    AND u.status='active';
  IF target.id IS NULL OR target.user_id=actor.id THEN
    RAISE EXCEPTION 'UNAVAILABLE_PROFESSIONAL' USING ERRCODE='22023';
  END IF;

  IF (
    SELECT count(*) FROM beauty.messages m
    WHERE m.sender_user_id=actor.id
      AND m.created_at>now()-interval '1 hour'
  ) >= 60 THEN
    RAISE EXCEPTION 'TOO_MANY_MESSAGES' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.conversations(customer_id,professional_id,customer_read_at)
  VALUES(actor.id,target.id,now())
  ON CONFLICT(customer_id,professional_id) DO NOTHING;

  SELECT c.id INTO conversation_id
  FROM beauty.conversations c
  WHERE c.customer_id=actor.id AND c.professional_id=target.id
  FOR UPDATE;

  INSERT INTO beauty.messages(conversation_id,sender_user_id,body)
  VALUES(conversation_id,actor.id,clean_body)
  RETURNING id INTO message_id;

  UPDATE beauty.conversations
  SET last_message_at=now(),customer_read_at=now()
  WHERE id=conversation_id;

  RETURN jsonb_build_object(
    'conversationId',conversation_id,
    'messageId',message_id
  );
END $$;

CREATE FUNCTION beauty.message_booking(
  target_booking uuid,
  message_body text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor beauty.users;
  booking beauty.bookings;
  professional_user_id uuid;
  conversation_id uuid;
  message_id uuid;
  clean_body text;
  actor_is_customer boolean;
  actor_is_professional boolean;
BEGIN
  clean_body:=trim(message_body);
  IF clean_body IS NULL OR length(clean_body) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE' USING ERRCODE='22023';
  END IF;

  SELECT * INTO actor
  FROM beauty.users
  WHERE auth_id=beauty.auth_id() AND status='active';
  SELECT * INTO booking FROM beauty.bookings WHERE id=target_booking;
  SELECT user_id INTO professional_user_id
  FROM beauty.professional_profiles
  WHERE id=booking.professional_id;

  actor_is_customer:=actor.id IS NOT NULL AND actor.id=booking.customer_id;
  actor_is_professional:=
    actor.id IS NOT NULL AND actor.id=professional_user_id;

  IF booking.id IS NULL OR NOT(actor_is_customer OR actor_is_professional) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF (
    SELECT count(*) FROM beauty.messages m
    WHERE m.sender_user_id=actor.id
      AND m.created_at>now()-interval '1 hour'
  ) >= 60 THEN
    RAISE EXCEPTION 'TOO_MANY_MESSAGES' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.conversations(
    customer_id,professional_id,customer_read_at,professional_read_at
  )
  VALUES(
    booking.customer_id,
    booking.professional_id,
    CASE WHEN actor_is_customer THEN now() ELSE NULL END,
    CASE WHEN actor_is_professional THEN now() ELSE NULL END
  )
  ON CONFLICT(customer_id,professional_id) DO NOTHING;

  SELECT c.id INTO conversation_id
  FROM beauty.conversations c
  WHERE c.customer_id=booking.customer_id
    AND c.professional_id=booking.professional_id
  FOR UPDATE;

  INSERT INTO beauty.messages(
    conversation_id,sender_user_id,booking_id,body
  )
  VALUES(conversation_id,actor.id,booking.id,clean_body)
  RETURNING id INTO message_id;

  UPDATE beauty.conversations
  SET
    last_message_at=now(),
    customer_read_at=CASE
      WHEN actor_is_customer THEN now() ELSE customer_read_at END,
    professional_read_at=CASE
      WHEN actor_is_professional THEN now() ELSE professional_read_at END
  WHERE id=conversation_id;

  RETURN jsonb_build_object(
    'conversationId',conversation_id,
    'messageId',message_id
  );
END $$;

CREATE FUNCTION beauty.send_message(
  target_conversation uuid,
  message_body text,
  target_booking uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor beauty.users;
  conversation beauty.conversations;
  professional_user_id uuid;
  booking beauty.bookings;
  message_id uuid;
  clean_body text;
  actor_is_customer boolean;
  actor_is_professional boolean;
BEGIN
  clean_body:=trim(message_body);
  IF clean_body IS NULL OR length(clean_body) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE' USING ERRCODE='22023';
  END IF;

  SELECT * INTO actor
  FROM beauty.users
  WHERE auth_id=beauty.auth_id() AND status='active';
  SELECT * INTO conversation
  FROM beauty.conversations
  WHERE id=target_conversation
  FOR UPDATE;
  SELECT user_id INTO professional_user_id
  FROM beauty.professional_profiles
  WHERE id=conversation.professional_id;

  actor_is_customer:=
    actor.id IS NOT NULL AND actor.id=conversation.customer_id;
  actor_is_professional:=
    actor.id IS NOT NULL AND actor.id=professional_user_id;

  IF conversation.id IS NULL OR NOT(actor_is_customer OR actor_is_professional) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF target_booking IS NOT NULL THEN
    SELECT * INTO booking FROM beauty.bookings WHERE id=target_booking;
    IF booking.id IS NULL
      OR booking.customer_id<>conversation.customer_id
      OR booking.professional_id<>conversation.professional_id THEN
      RAISE EXCEPTION 'INVALID_BOOKING_CONTEXT' USING ERRCODE='22023';
    END IF;
  END IF;

  IF (
    SELECT count(*) FROM beauty.messages m
    WHERE m.sender_user_id=actor.id
      AND m.created_at>now()-interval '1 hour'
  ) >= 60 THEN
    RAISE EXCEPTION 'TOO_MANY_MESSAGES' USING ERRCODE='22023';
  END IF;

  INSERT INTO beauty.messages(
    conversation_id,sender_user_id,booking_id,body
  )
  VALUES(target_conversation,actor.id,target_booking,clean_body)
  RETURNING id INTO message_id;

  UPDATE beauty.conversations
  SET
    last_message_at=now(),
    customer_read_at=CASE
      WHEN actor_is_customer THEN now() ELSE customer_read_at END,
    professional_read_at=CASE
      WHEN actor_is_professional THEN now() ELSE professional_read_at END
  WHERE id=target_conversation;

  RETURN jsonb_build_object(
    'conversationId',target_conversation,
    'messageId',message_id
  );
END $$;

CREATE FUNCTION beauty.mark_conversation_read(
  target_conversation uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor beauty.users;
  conversation beauty.conversations;
  professional_user_id uuid;
BEGIN
  SELECT * INTO actor
  FROM beauty.users
  WHERE auth_id=beauty.auth_id() AND status='active';
  SELECT * INTO conversation
  FROM beauty.conversations
  WHERE id=target_conversation
  FOR UPDATE;
  SELECT user_id INTO professional_user_id
  FROM beauty.professional_profiles
  WHERE id=conversation.professional_id;

  IF actor.id IS NULL OR conversation.id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF actor.id=conversation.customer_id THEN
    UPDATE beauty.conversations
    SET customer_read_at=now()
    WHERE id=target_conversation;
  ELSIF actor.id=professional_user_id THEN
    UPDATE beauty.conversations
    SET professional_read_at=now()
    WHERE id=target_conversation;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
END $$;

GRANT CREATE ON SCHEMA beauty TO beauty_messaging_ops;
ALTER FUNCTION beauty.message_professional(uuid,text)
  OWNER TO beauty_messaging_ops;
ALTER FUNCTION beauty.message_booking(uuid,text)
  OWNER TO beauty_messaging_ops;
ALTER FUNCTION beauty.send_message(uuid,text,uuid)
  OWNER TO beauty_messaging_ops;
ALTER FUNCTION beauty.mark_conversation_read(uuid)
  OWNER TO beauty_messaging_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_messaging_ops;

REVOKE ALL ON FUNCTION
  beauty.message_professional(uuid,text),
  beauty.message_booking(uuid,text),
  beauty.send_message(uuid,text,uuid),
  beauty.mark_conversation_read(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  beauty.message_professional(uuid,text),
  beauty.message_booking(uuid,text),
  beauty.send_message(uuid,text,uuid),
  beauty.mark_conversation_read(uuid)
TO beauty_app;

-- Customer identity is private: visible only to the customer and their booking professionals.
ALTER TABLE beauty.customer_profiles
  ADD COLUMN first_name text NOT NULL DEFAULT '' CHECK(length(first_name)<=60),
  ADD COLUMN last_name text NOT NULL DEFAULT '' CHECK(length(last_name)<=59),
  ADD COLUMN photo bytea CHECK(octet_length(photo)<=3145728);
CREATE POLICY customer_self_edit ON beauty.customer_profiles FOR UPDATE TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=user_id AND u.auth_id=beauty.auth_id() AND u.status='active'))
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=user_id AND u.auth_id=beauty.auth_id() AND u.status='active'));
GRANT UPDATE(first_name,last_name,photo) ON beauty.customer_profiles TO beauty_app;

CREATE TABLE beauty.professional_client_blocks(
 professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 customer_id uuid NOT NULL REFERENCES beauty.users(id),
 blocked boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(professional_id,customer_id)
);
CREATE INDEX professional_client_blocks_customer ON beauty.professional_client_blocks(customer_id);
ALTER TABLE beauty.professional_client_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.professional_client_blocks FORCE ROW LEVEL SECURITY;
CREATE POLICY client_blocks_owner_read ON beauty.professional_client_blocks FOR SELECT TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE POLICY client_blocks_customer_read ON beauty.professional_client_blocks FOR SELECT TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.users u WHERE u.id=customer_id AND u.auth_id=beauty.auth_id() AND u.status='active'));
CREATE POLICY client_blocks_owner_insert ON beauty.professional_client_blocks FOR INSERT TO beauty_app
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id)
 AND EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.professional_id=professional_client_blocks.professional_id
 AND b.customer_id=professional_client_blocks.customer_id AND b.status IN('confirmed','completed','no_show','cancelled')));
CREATE POLICY client_blocks_owner_update ON beauty.professional_client_blocks FOR UPDATE TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id))
 WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
GRANT SELECT ON beauty.professional_client_blocks TO beauty_app,beauty_booking_ops;
GRANT INSERT(professional_id,customer_id,blocked) ON beauty.professional_client_blocks TO beauty_app;
GRANT UPDATE(blocked) ON beauty.professional_client_blocks TO beauty_app;
CREATE POLICY client_blocks_reservation_read ON beauty.professional_client_blocks FOR SELECT TO beauty_booking_ops USING(true);
CREATE POLICY customer_booking_professional_read ON beauty.customer_profiles FOR SELECT TO beauty_app
 USING(EXISTS(SELECT 1 FROM beauty.bookings b JOIN beauty.professional_profiles p ON p.id=b.professional_id
 WHERE b.customer_id=customer_profiles.user_id AND b.status IN('confirmed','completed','no_show','cancelled'))
 OR EXISTS(SELECT 1 FROM beauty.professional_client_blocks cb JOIN beauty.professional_profiles p ON p.id=cb.professional_id
 WHERE cb.customer_id=customer_profiles.user_id));

-- Use the same transaction lock for block changes and new reservations.
-- Existing appointments, checkout sessions, refunds and transfers are untouched.
CREATE FUNCTION beauty.lock_client_block_change() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,beauty AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.professional_id::text||':'||NEW.customer_id::text,0));
 NEW.updated_at:=now();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.lock_client_block_change() FROM PUBLIC;
CREATE TRIGGER lock_client_block_change BEFORE INSERT OR UPDATE ON beauty.professional_client_blocks
 FOR EACH ROW EXECUTE FUNCTION beauty.lock_client_block_change();
CREATE FUNCTION beauty.enforce_client_booking_block() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,beauty AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.professional_id::text||':'||NEW.customer_id::text,0));
 IF EXISTS(SELECT 1 FROM beauty.professional_client_blocks cb WHERE cb.professional_id=NEW.professional_id
 AND cb.customer_id=NEW.customer_id AND cb.blocked) THEN
   RAISE EXCEPTION 'CLIENT_BLOCKED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beauty.enforce_client_booking_block() FROM PUBLIC;
CREATE TRIGGER enforce_client_booking_block BEFORE INSERT ON beauty.bookings
 FOR EACH ROW EXECUTE FUNCTION beauty.enforce_client_booking_block();

-- Remove accidental PUBLIC execute grants from privileged and trigger-only
-- routines while preserving explicit app access where required.

REVOKE EXECUTE ON FUNCTION beauty.admin_set_professional_trust(
  uuid,text,text,timestamptz,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_set_professional_trust(
  uuid,text,text,timestamptz,text
) TO beauty_app;

REVOKE EXECUTE ON FUNCTION beauty.admin_set_professional_trust(
  uuid,text,text,timestamptz,boolean,boolean,boolean,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_set_professional_trust(
  uuid,text,text,timestamptz,boolean,boolean,boolean,text
) TO beauty_app;

REVOKE EXECUTE ON FUNCTION beauty.owner_active_booking_fee_rule() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.owner_active_booking_fee_rule() TO beauty_app;

REVOKE EXECUTE ON FUNCTION beauty.apply_verified_minimum_deposit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION beauty.enforce_service_deposit_policy() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION beauty.enforce_tiered_dispute_payout_policy() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION beauty.enforce_verified_booking_review() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION beauty.enforce_verified_service_deposit_on_booking() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION beauty.sync_professional_dispute_withdrawal_freeze() FROM PUBLIC;

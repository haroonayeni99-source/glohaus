# Owner-managed academy onboarding pilot

Owner-only cohort creation, draft/active/closed status, addition of existing professional accounts with permission evidence, and membership removal when permission is withdrawn. No external student contacts, invitations or portals. Cohort membership does not change referral attribution, verification, plan eligibility, Founding commitments, rewards or messaging.

The table reports publication, active services, working-hours presence and completed paid booking counts. Counts exclude disputed bookings and fully refunded payments and are not referral reward qualification. Private permission evidence is removed with membership; the existing Owner audit records actor, date, reason and identifiers without copying the evidence. Use reasons without sensitive personal information.

The existing internal beauty_admin_ops role receives narrowly scoped SELECT access to availability rules for cohort members, so the Owner-only function can return an hours-present boolean. No anonymous, authenticated or beauty_app direct table access is granted.

Seven focused API/database tests passed: Owner/verified context, origin and input checks, active-cohort requirement, setup state, duplicate membership, removal and private records. TypeScript and lint passed. Final-head production build passed. Hosted isolated staging migration and rollback-only cohort create/activate/add/read/remove smoke passed under operator context. Local beauty_app tests verify Owner access restrictions. Final-head CI and authenticated browser review remain pending. Production is blocked until a verified restorable database backup exists. No production migration has run.

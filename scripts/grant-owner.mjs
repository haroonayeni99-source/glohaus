import { Client } from "pg";

const [authId, operator, reason] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (
  !process.env.MIGRATION_DATABASE_URL ||
  !uuid.test(authId ?? "") ||
  !operator ||
  !reason ||
  reason.trim().length < 5
) {
  console.error(
    'Usage: pnpm owner:grant <Supabase-user-UUID> <operator-reference> "Reason for ownership". Requires MIGRATION_DATABASE_URL.',
  );
  process.exit(1);
}

const db = new Client({
  connectionString: process.env.MIGRATION_DATABASE_URL,
  connectionTimeoutMillis: 10_000,
});

try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(74201836)");
  const { rows } = await db.query(
    "SELECT id FROM beauty.users WHERE auth_id = $1 AND status = 'active' FOR UPDATE",
    [authId],
  );
  if (rows.length !== 1)
    throw new Error("An active, enrolled account is required before ownership can be granted.");

  const existing = await db.query(
    "SELECT user_id FROM beauty.user_roles WHERE role = 'owner' FOR UPDATE",
  );
  if (existing.rows.length)
    throw new Error("An owner already exists. Ownership changes require an audited operator procedure.");

  const userId = rows[0].id;
  await db.query(
    "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner'),($1,'admin') ON CONFLICT DO NOTHING",
    [userId],
  );
  await db.query(
    "INSERT INTO beauty.admin_audit_logs(actor_reference,action,target_user_id,reason) VALUES($1,'owner_role_granted',$2,$3)",
    [operator, userId, reason.trim()],
  );
  await db.query("COMMIT");
  console.info("Owner access is provisioned. Admin routes still require recent multi-factor verification.");
} catch {
  await db.query("ROLLBACK").catch(() => {});
  console.error(
    "Owner provisioning failed. Verify the account has enrolled, there is no existing owner, and the operator connection has migration privileges.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}

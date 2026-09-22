import { Client } from "pg";

const [authId, operator, reason] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!process.env.MIGRATION_DATABASE_URL || !uuid.test(authId ?? "") || !operator || !reason || reason.length < 5) {
  console.error('Usage: pnpm admin:grant <Supabase-user-UUID> <operator-reference> "Reason for access". Requires MIGRATION_DATABASE_URL.');
  process.exit(1);
}
const db = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await db.connect();
  await db.query("BEGIN");
  const { rows } = await db.query("SELECT id FROM beauty.users WHERE auth_id = $1 AND status = 'active' FOR UPDATE", [authId]);
  if (rows.length !== 1) throw new Error("Active enrolled account required");
  const granted = await db.query("INSERT INTO beauty.user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING RETURNING user_id", [rows[0].id]);
  if (granted.rows.length) await db.query("INSERT INTO beauty.admin_audit_logs (actor_reference, action, target_user_id, reason) VALUES ($1, 'admin_role_granted', $2, $3)", [operator, rows[0].id, reason]);
  await db.query("COMMIT");
  console.info("Admin role is provisioned. Recent second-factor verification is still required to enter /admin.");
} catch {
  await db.query("ROLLBACK").catch(() => {});
  console.error("Admin provisioning failed. Verify the account is enrolled and active and the operator connection has the required privileges.");
  process.exitCode = 1;
} finally { await db.end(); }

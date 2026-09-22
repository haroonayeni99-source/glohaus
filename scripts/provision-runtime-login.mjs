import { Client } from "pg";

const role = "glohaus_runtime";
const password = process.env.GLOHAUS_RUNTIME_DATABASE_PASSWORD;

if (!process.env.MIGRATION_DATABASE_URL || !password || password.length < 32) {
  console.error(
    "Set MIGRATION_DATABASE_URL and a 32+ character GLOHAUS_RUNTIME_DATABASE_PASSWORD on this trusted operator machine.",
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
  await db.query("SELECT pg_advisory_xact_lock(74201837)");

  // pg_roles is a readable catalog view, not an application row to lock.
  // FOR UPDATE requires extra catalog permissions; the advisory lock above
  // serializes cooperating provisioning runs without locking system catalogs.
  const { rows } = await db.query(
    `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolinherit,
      pg_has_role($1, 'beauty_app', 'MEMBER') AS app_member,
      EXISTS (
        SELECT 1 FROM pg_roles privileged
        WHERE privileged.rolname IN (
          'beauty_catalog','beauty_admin_ops','beauty_booking_ops',
          'beauty_payment_worker','beauty_financial_worker'
        ) AND pg_has_role($1, privileged.oid, 'MEMBER')
      ) AS privileged_member
    FROM pg_roles WHERE rolname = $1`,
    [role],
  );
  const runtime = rows[0];
  if (
    !runtime ||
    runtime.rolsuper ||
    runtime.rolbypassrls ||
    runtime.rolinherit ||
    !runtime.app_member ||
    runtime.privileged_member
  ) {
    throw new Error("Runtime role is not in the expected state. Run pnpm db:migrate first.");
  }

  await db.query("SET LOCAL password_encryption = 'scram-sha-256'");
  // PostgreSQL does not allow a bind parameter in ALTER ROLE ... PASSWORD.
  // This changes LOGIN and the password only; it never alters SUPERUSER,
  // BYPASSRLS or any other managed-role attribute. format(%L) quotes it
  // server-side and this script never prints the generated SQL.
  const passwordStatement = await db.query(
    "SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS statement",
    [role, password],
  );
  await db.query(passwordStatement.rows[0].statement);
  await db.query("COMMIT");
  console.info("Glohaus runtime login provisioned. Store its pooled DATABASE_URL only in Vercel's server-side environment.");
} catch {
  await db.query("ROLLBACK").catch(() => {});
  console.error(
    "Runtime login provisioning failed. Confirm migration 0025 is applied and use a trusted migration connection. No password was printed.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}

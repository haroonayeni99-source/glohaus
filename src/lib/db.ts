import "server-only";
import { Pool } from "pg";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";

const globalDb = globalThis as unknown as { beautyPool?: Pool };
function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new AccessError("UNAVAILABLE", 503);
  return (globalDb.beautyPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  }));
}

export async function withIdentity<T>(
  authId: string,
  work: (db: SqlClient) => Promise<T>,
): Promise<T> {
  const db = await pool().connect();
  try {
    await db.query("BEGIN");
    // Refuse owner/bypass credentials, even if an operator misconfigures DATABASE_URL.
    const { rows } =
      await db.query(`SELECT r.rolsuper OR r.rolbypassrls OR EXISTS (SELECT 1 FROM pg_roles privileged WHERE privileged.rolname IN ('beauty_catalog','beauty_booking_ops','beauty_admin_ops','beauty_payment_worker','beauty_financial_worker') AND pg_has_role(current_user,privileged.oid,'MEMBER')) OR EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'beauty' AND c.relkind = 'r' AND pg_has_role(current_user, c.relowner, 'MEMBER')
    ) AS unsafe FROM pg_roles r WHERE r.rolname = current_user`);
    if (rows[0]?.unsafe !== false) throw new AccessError("UNAVAILABLE", 503);
    await db.query("SET LOCAL ROLE beauty_app");
    await db.query("SET LOCAL statement_timeout = '5s'");
    await db.query("SELECT set_config('app.auth_id', $1, true)", [authId]);
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

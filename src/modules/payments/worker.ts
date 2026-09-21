import "server-only";
import { Pool } from "pg";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
let pool: Pool | undefined;
export async function withPaymentWorker<T>(
  work: (db: SqlClient) => Promise<T>,
) {
  if (!process.env.PAYMENT_DATABASE_URL)
    throw new AccessError("UNAVAILABLE", 503);
  pool ??= new Pool({
    connectionString: process.env.PAYMENT_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
  });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await db.query<{ unsafe: boolean }>(
      `SELECT r.rolsuper OR r.rolbypassrls OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='beauty' AND c.relkind='r' AND pg_has_role(current_user,c.relowner,'MEMBER')) OR pg_has_role(current_user,'beauty_booking_ops','MEMBER') OR pg_has_role(current_user,'beauty_admin_ops','MEMBER') AS unsafe FROM pg_roles r WHERE r.rolname=current_user`,
    );
    if (result.rows[0]?.unsafe !== false)
      throw new AccessError("UNAVAILABLE", 503);
    await db.query("SET LOCAL ROLE beauty_payment_worker");
    await db.query("SET LOCAL statement_timeout='5s'");
    const value = await work(db);
    await db.query("COMMIT");
    return value;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

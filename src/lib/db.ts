import "server-only";
import { Pool } from "pg";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";

const globalDb = globalThis as unknown as { beautyPool?: Pool };

function runtimeConnection() {
  if (process.env.DATABASE_URL)
    return { connectionString: process.env.DATABASE_URL, previewFallback: false };

  if (process.env.VERCEL_ENV === "preview" && process.env.POSTGRES_URL)
    return { connectionString: process.env.POSTGRES_URL, previewFallback: true };

  throw new AccessError("UNAVAILABLE", 503);
}

function pool(): Pool {
  const { connectionString } = runtimeConnection();
  return (globalDb.beautyPool ??= new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  }));
}

export async function withIdentity<T>(
  authId: string,
  work: (db: SqlClient) => Promise<T>,
): Promise<T> {
  const runtime = runtimeConnection();
  const db = await pool().connect();
  try {
    await db.query("BEGIN");

    // Preview deployments created through the Vercel Supabase integration may
    // only receive POSTGRES_URL. It can be owner-capable, so immediately drop
    // into beauty_app before any application query is allowed to run.
    if (runtime.previewFallback) await db.query("SET LOCAL ROLE beauty_app");

    // Refuse owner/bypass credentials in normal runtime. In the Preview-only
    // fallback, current_user has already been reduced to beauty_app above.
    const { rows } =
      await db.query(`SELECT r.rolsuper OR r.rolbypassrls OR EXISTS (SELECT 1 FROM pg_roles privileged WHERE privileged.rolname IN ('beauty_catalog','beauty_booking_ops','beauty_admin_ops','beauty_payment_worker','beauty_financial_worker') AND pg_has_role(current_user,privileged.oid,'MEMBER')) OR EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'beauty' AND c.relkind = 'r' AND pg_has_role(current_user, c.relowner, 'MEMBER')
    ) AS unsafe FROM pg_roles r WHERE r.rolname = current_user`);
    if (rows[0]?.unsafe !== false) throw new AccessError("UNAVAILABLE", 503);

    if (!runtime.previewFallback) await db.query("SET LOCAL ROLE beauty_app");

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

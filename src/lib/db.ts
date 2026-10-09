import "server-only";
import { serialSqlClient } from "./serial-sql-client";
import { Pool, type PoolClient } from "pg";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";

const globalDb = globalThis as unknown as { beautyPool?: Pool };

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function isTransientConnectionError(error: unknown) {
  const code = errorCode(error);
  if (
    code.startsWith("08") ||
    ["57P01", "57P02", "57P03", "ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(
      code,
    )
  )
    return true;

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /timeout exceeded when trying to connect|connection terminated|connection closed|socket hang up|econnreset|read eof|server closed the connection/i.test(
    message,
  );
}

function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new AccessError("UNAVAILABLE", 503);
  const connectionString = process.env.DATABASE_URL;

  if (!globalDb.beautyPool) {
    const dbPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 5000,
      allowExitOnIdle: true,
    });

    // Supavisor may recycle idle transaction-pooler sockets. Pool-level errors
    // should be logged rather than crashing the serverless process.
    dbPool.on("error", (error) => {
      console.warn("Database pool idle connection closed", {
        type: error.name,
        code: errorCode(error),
      });
    });

    globalDb.beautyPool = dbPool;
  }

  return globalDb.beautyPool;
}

async function connectWithRetry(): Promise<PoolClient> {
  const delays = [0, 125, 450] as const;
  let lastError: unknown;

  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await pool().connect();
    } catch (error) {
      lastError = error;
      console.error("Database connection attempt failed", {
        type: error instanceof Error ? error.name : "UnknownError",
        code: errorCode(error),
      });
      // Bad credentials and programming errors will not improve on retry.
      if (!isTransientConnectionError(error)) throw error;
    }
  }

  throw lastError;
}

async function runWithIdentity<T>(
  authId: string,
  work: (db: SqlClient) => Promise<T>,
): Promise<T> {
  const db = await connectWithRetry();
  let activeConnectionError: unknown = null;
  const onClientError = (error: Error) => {
    activeConnectionError = error;
    console.warn("Active database connection closed", {
      type: error.name,
      code: errorCode(error),
    });
  };
  db.on("error", onClientError);

  const sql = serialSqlClient(db);
  try {
    await db.query("BEGIN");
    // Refuse owner/bypass credentials, even if an operator misconfigures DATABASE_URL.
    const { rows } = await db.query(`SELECT r.rolsuper OR r.rolbypassrls OR EXISTS (
      SELECT 1
      FROM pg_roles privileged
      WHERE privileged.rolname IN (
        'beauty_catalog','beauty_booking_ops','beauty_admin_ops',
        'beauty_payment_worker','beauty_financial_worker'
      )
      AND pg_has_role(current_user,privileged.oid,'MEMBER')
    ) OR EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'beauty'
        AND c.relkind = 'r'
        AND pg_has_role(current_user, c.relowner, 'MEMBER')
    ) AS unsafe
    FROM pg_roles r
    WHERE r.rolname = current_user`);

    if (rows[0]?.unsafe !== false) throw new AccessError("UNAVAILABLE", 503);

    await db.query("SET LOCAL ROLE beauty_app");
    await db.query("SET LOCAL statement_timeout = '5s'");
    await db.query("SELECT set_config('app.auth_id', $1, true)", [authId]);

    const result = await work(sql);
    await sql.drain();
    if (activeConnectionError) throw activeConnectionError;
    await db.query("COMMIT");
    return result;
  } catch (error) {
    // Drain already queued work before rollback; failed queues skip later queries.
    await sql.drain().catch(() => {});
    try {
      await db.query("ROLLBACK");
    } catch {
      // A dropped socket cannot roll back locally; the server-side transaction
      // is already gone with the connection.
    }
    throw error;
  } finally {
    db.removeListener("error", onClientError);
    db.release(true);
  }
}

export async function withIdentity<T>(
  authId: string,
  work: (db: SqlClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runWithIdentity(authId, work);
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === 1) throw error;
      console.warn("Retrying database transaction after transient connection loss", {
        code: errorCode(error),
      });
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
  }
  throw lastError;
}

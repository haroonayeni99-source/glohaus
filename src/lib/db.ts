import "server-only";
import { serialSqlClient } from "./serial-sql-client";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
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

// Classify failures without logging URLs, credentials, SQL, or customer details.
function connectionFailure(error: unknown) {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : "";
  if (/timeout|timed out/i.test(message) || code === "ETIMEDOUT")
    return "TIMEOUT";
  if (
    ["ECONNRESET", "EPIPE", "ECONNREFUSED"].includes(code) ||
    /connection terminated|connection closed|socket hang up|read eof|server closed/i.test(
      message,
    )
  )
    return "CONNECTION_CLOSED";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "DNS";
  if (code.startsWith("28")) return "AUTHENTICATION";
  if (code === "53300") return "CAPACITY";
  return "UNKNOWN";
}

function retryableConnect(error: unknown) {
  return (
    isTransientConnectionError(error) ||
    ["EAI_AGAIN", "ECONNREFUSED", "53300"].includes(errorCode(error)) ||
    connectionFailure(error) === "TIMEOUT"
  );
}

function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new AccessError("UNAVAILABLE", 503);
  const connectionString = process.env.DATABASE_URL;

  if (!globalDb.beautyPool) {
    const dbPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 5000,
      allowExitOnIdle: true,
    });

    // Keep healthy connections warm while Vercel drains idle clients before
    // suspending an instance. Failed transactions still discard their client.
    attachDatabasePool(dbPool);

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
  const startedAt = Date.now();

  for (const [index, delay] of delays.entries()) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const client = await pool().connect();
      if (index > 0)
        console.info("Database connection recovered", {
          attempts: index + 1,
          elapsedMs: Date.now() - startedAt,
        });
      return client;
    } catch (error) {
      const retrying = retryableConnect(error) && index < delays.length - 1;
      const details = {
        reason: connectionFailure(error),
        code: /^[A-Z0-9_]{2,20}$/.test(errorCode(error))
          ? errorCode(error)
          : "UNSPECIFIED",
        attempt: index + 1,
        elapsedMs: Date.now() - startedAt,
        waiting: globalDb.beautyPool?.waitingCount ?? 0,
      };
      if (retrying)
        console.warn("Database connection retry scheduled", details);
      else {
        console.error("Database connection unavailable", details);
        // Do not multiply exhausted connection retries in withIdentity().
        throw new AccessError("UNAVAILABLE", 503);
      }
    }
  }

  throw new AccessError("UNAVAILABLE", 503);
}

async function runWithIdentity<T>(
  authId: string,
  work: (db: SqlClient) => Promise<T>,
): Promise<T> {
  const db = await connectWithRetry();
  let activeConnectionError: unknown = null;
  let committed = false;
  let commitStarted = false;
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
    const { rows } =
      await db.query(`SELECT r.rolsuper OR r.rolbypassrls OR EXISTS (
      SELECT 1
      FROM pg_roles privileged
      WHERE privileged.rolname IN (
        'beauty_catalog','beauty_booking_ops','beauty_admin_ops',
        'beauty_payment_worker','beauty_financial_worker',
        'beauty_support_intake','beauty_shop_stats','beauty_notification_ops'
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
    commitStarted = true;
    await db.query("COMMIT");
    committed = true;
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
    // A disconnected COMMIT may already have succeeded on the server. Replaying
    // it could duplicate a write, so let the caller reload the stored outcome.
    if (commitStarted && isTransientConnectionError(error)) {
      console.error("Database commit confirmation unavailable", {
        reason: connectionFailure(error),
      });
      throw new AccessError("UNAVAILABLE", 503);
    }
    throw error;
  } finally {
    db.removeListener("error", onClientError);
    // All role and identity settings above are transaction-local. Only reuse
    // clients whose transaction finished successfully; discard every failure.
    db.release(!committed || Boolean(activeConnectionError));
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
      console.warn(
        "Retrying database transaction after transient connection loss",
        {
          code: errorCode(error),
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
  }
  throw lastError;
}

import "server-only";
import { Pool, type PoolClient } from "pg";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import { paymentDatabaseConfig } from "./database-config";

let pool: Pool | undefined;

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

function paymentPool() {
  if (!process.env.PAYMENT_DATABASE_URL)
    throw new AccessError("UNAVAILABLE", 503);

  if (!pool) {
    pool = new Pool(
      paymentDatabaseConfig(
        process.env.PAYMENT_DATABASE_URL,
        process.env.PAYMENT_DATABASE_CA_CERT,
      ),
    );
    pool.on("error", (error) => {
      console.warn("Payment database pool idle connection closed", {
        type: error.name,
        code: errorCode(error),
      });
    });
  }

  return pool;
}

async function connectWithRetry(): Promise<PoolClient> {
  const delays = [0, 125, 450] as const;
  let lastError: unknown;

  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await paymentPool().connect();
    } catch (error) {
      lastError = error;
      console.error("Payment database connection attempt failed", {
        type: error instanceof Error ? error.name : "UnknownError",
        code: errorCode(error),
      });
      if (!isTransientConnectionError(error)) throw error;
    }
  }

  throw lastError;
}

async function runPaymentWorker<T>(
  work: (db: SqlClient) => Promise<T>,
): Promise<T> {
  const db = await connectWithRetry();
  let activeConnectionError: unknown = null;

  const onClientError = (error: Error) => {
    activeConnectionError = error;
    console.warn("Active payment database connection closed", {
      type: error.name,
      code: errorCode(error),
    });
  };

  db.on("error", onClientError);

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
    if (activeConnectionError) throw activeConnectionError;
    await db.query("COMMIT");
    return value;
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      // If the socket was dropped, Postgres has already discarded the
      // connection-scoped transaction.
    }
    throw error;
  } finally {
    db.removeListener("error", onClientError);
    db.release(Boolean(activeConnectionError));
  }
}

export async function withPaymentWorker<T>(
  work: (db: SqlClient) => Promise<T>,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runPaymentWorker(work);
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === 1) throw error;
      console.warn(
        "Retrying payment database transaction after transient connection loss",
        { code: errorCode(error) },
      );
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
  }

  throw lastError;
}

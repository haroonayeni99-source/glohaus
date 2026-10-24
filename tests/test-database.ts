import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { migrationPlan } from "../scripts/migration-plan.mjs";

export async function createTestDatabase() {
  if (process.env.GLOHAUS_NATIVE_DATABASE === "1") {
    // This adapter is exclusively for the disposable local CI service. Never
    // accept a URL, provider credentials or a configurable remote hostname.
    if (process.env.CI !== "true" || process.env.VERCEL)
      throw new Error("Native database checks require the isolated CI service");
    const { Pool } = await import("pg");
    const pool = new Pool({ host: "127.0.0.1", port: 5433,
      database: "glohaus_seller_validation", user: "postgres",
      password: "local-ci-fixture", max: 6 });
    const adapter = {
      query: (sql: string, values?: unknown[]) => pool.query(sql, values),
      exec: (sql: string) => pool.query(sql),
      transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await work({ query: (sql: string, values?: unknown[]) => client.query(sql, values),
            exec: (sql: string) => client.query(sql) });
          await client.query("COMMIT");
          return result;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
      },
      close: () => pool.end(),
    };
    await adapter.exec(`CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('test.auth_id',true),'')::uuid $$;`);
    // The tests use only the common SQL/transaction/close interface above.
    return adapter as unknown as PGlite;
  }
  const db = new PGlite();
  // Supabase supplies these before application migrations. This fixture is
  // isolated and contains no credentials or production users.
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('test.auth_id',true),'')::uuid
    $$;
  `);
  return db;
}

export async function applyTestMigrations(db: PGlite) {
  for (const migration of await migrationPlan()) {
    await db.exec(await readFile(migration.url, "utf8"));
  }
}

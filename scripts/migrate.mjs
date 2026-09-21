import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";

if (!process.env.MIGRATION_DATABASE_URL) throw new Error("Set MIGRATION_DATABASE_URL on the migration machine.");
const db = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(74201835)");
  await db.query("CREATE TABLE IF NOT EXISTS public.beauty_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    const sql = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await db.query("SELECT checksum FROM public.beauty_schema_migrations WHERE name = $1", [name]);
    if (existing.rows.length) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}. Add a new migration instead.`);
      continue;
    }
    await db.query(sql);
    await db.query("INSERT INTO public.beauty_schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
    console.info(`Applied ${name}`);
  }
  await db.query("COMMIT");
  console.info("Database migrations are current.");
} catch {
  await db.query("ROLLBACK").catch(() => {});
  console.error("Migration failed. Check connectivity, owner privileges, and migration checksums. No credentials were logged.");
  process.exitCode = 1;
} finally { await db.end(); }

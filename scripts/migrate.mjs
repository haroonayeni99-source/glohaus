import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { migrationPlan } from "./migration-plan.mjs";

if (!process.env.MIGRATION_DATABASE_URL) throw new Error("Set MIGRATION_DATABASE_URL on the migration machine.");
const db = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(74201835)");
  await db.query("CREATE TABLE IF NOT EXISTS public.beauty_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  await db.query("ALTER TABLE public.beauty_schema_migrations DISABLE ROW LEVEL SECURITY");
  await db.query("REVOKE ALL ON public.beauty_schema_migrations FROM PUBLIC, anon, authenticated");
  const plan = await migrationPlan();
  const migrationFiles = plan.map(migration => migration.name);

  const appliedRepoMigrations = await db.query(
    "SELECT name FROM public.beauty_schema_migrations ORDER BY name",
  );
  const appliedRepoNames = new Set(appliedRepoMigrations.rows.map((row) => row.name));
  const pendingRepoMigrations = migrationFiles.filter((name) => !appliedRepoNames.has(name));

  const externalHistoryTable = (
    await db.query(
      "SELECT to_regclass('supabase_migrations.schema_migrations')::text AS name",
    )
  ).rows[0]?.name;

  if (pendingRepoMigrations.length && externalHistoryTable) {
    const externalCount = Number(
      (
        await db.query(
          "SELECT count(*)::integer AS count FROM supabase_migrations.schema_migrations",
        )
      ).rows[0]?.count ?? 0,
    );
    if (externalCount > 0 && process.env.ALLOW_MIGRATION_DRIFT !== "1") {
      throw new Error(
        "Migration history drift detected: repo migrations are pending while Supabase migration history already exists. Reconcile the histories before running db:migrate. Set ALLOW_MIGRATION_DRIFT=1 only for an explicitly reviewed recovery.",
      );
    }
  }

  for (const { name, url } of plan) {
    const sql = await readFile(url, "utf8");
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

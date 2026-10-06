import { readdir } from "node:fs/promises";
import { Client } from "pg";

if (!process.env.MIGRATION_DATABASE_URL) {
  throw new Error("Set MIGRATION_DATABASE_URL on the migration machine.");
}

const db = new Client({
  connectionString: process.env.MIGRATION_DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

try {
  await db.connect();

  const directory = new URL("../db/migrations/", import.meta.url);
  const repoFiles = (await readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();

  const customTable = (
    await db.query(
      "SELECT to_regclass('public.beauty_schema_migrations')::text AS name",
    )
  ).rows[0]?.name;

  const managedTable = (
    await db.query(
      "SELECT to_regclass('supabase_migrations.schema_migrations')::text AS name",
    )
  ).rows[0]?.name;

  const customRows = customTable
    ? (
        await db.query(
          "SELECT name FROM public.beauty_schema_migrations ORDER BY name",
        )
      ).rows.map((row) => row.name)
    : [];

  const managedRows = managedTable
    ? (
        await db.query(
          "SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version",
        )
      ).rows
    : [];

  const custom = new Set(customRows);
  const pendingRepo = repoFiles.filter((name) => !custom.has(name));
  const missingFromRepo = customRows.filter((name) => !repoFiles.includes(name));

  const status = {
    repoMigrationFiles: repoFiles.length,
    customLedgerRows: customRows.length,
    managedSupabaseRows: managedRows.length,
    pendingRepoAgainstCustomLedger: pendingRepo.length,
    customLedgerEntriesMissingFromRepo: missingFromRepo.length,
    driftDetected:
      managedRows.length > 0 &&
      (pendingRepo.length > 0 || missingFromRepo.length > 0),
  };

  console.info(JSON.stringify(status, null, 2));

  if (pendingRepo.length) {
    console.info("\nPending repo migrations against custom ledger:");
    for (const name of pendingRepo) console.info(`- ${name}`);
  }

  if (missingFromRepo.length) {
    console.info("\nCustom-ledger entries missing from repo:");
    for (const name of missingFromRepo) console.info(`- ${name}`);
  }

  if (status.driftDetected) {
    console.error(
      "\nMigration drift is present. Do not run db:migrate until histories are deliberately reconciled.",
    );
    process.exitCode = 2;
  } else {
    console.info("\nMigration histories do not show unsafe drift.");
  }
} finally {
  await db.end();
}

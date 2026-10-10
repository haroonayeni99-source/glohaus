import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { migrationPlan } from "../scripts/migration-plan.mjs";

export async function createTestDatabase() {
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

import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";

const db = new PGlite();

afterAll(() => db.close());

describe("runtime login password statement", () => {
  it("reads the actual safety query with ordinary catalog permissions", async () => {
    const script = await readFile(new URL("../scripts/provision-runtime-login.mjs", import.meta.url), "utf8");
    const query = script.match(/`(SELECT rolname,[\s\S]*?)`/)?.[1];
    expect(query).toBeTruthy();
    await db.exec(`
      CREATE ROLE provision_reader NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE beauty_app NOLOGIN;
      CREATE ROLE beauty_catalog NOLOGIN;
      CREATE ROLE glohaus_runtime NOLOGIN NOINHERIT;
      GRANT beauty_app TO glohaus_runtime;
    `);
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE provision_reader");
      const result = await tx.query(query!, ["glohaus_runtime"]);
      expect(result.rows).toEqual([expect.objectContaining({
        rolsuper: false, rolbypassrls: false, rolinherit: false,
        app_member: true, privileged_member: false,
      })]);
    });
    await db.exec("GRANT beauty_catalog TO glohaus_runtime");
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE provision_reader");
      const result = await tx.query(query!, ["glohaus_runtime"]);
      expect(result.rows).toEqual([expect.objectContaining({ privileged_member: true })]);
    });
  });
  it("types both format parameters so PostgreSQL can quote the role and password safely", async () => {
    const result = await db.query<{ statement: string }>(
      "SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS statement",
      ["glohaus_runtime", "test-password's-characters"],
    );

    expect(result.rows[0].statement).toBe(
      "ALTER ROLE glohaus_runtime LOGIN PASSWORD 'test-password''s-characters'",
    );
  });
});

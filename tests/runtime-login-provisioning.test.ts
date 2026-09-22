import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";

const db = new PGlite();

afterAll(() => db.close());

describe("runtime login password statement", () => {
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

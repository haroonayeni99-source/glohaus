import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = await createTestDatabase();
async function asUser<T>(
  authId: string,
  work: (db: SqlClient) => Promise<T>,
  verified = true,
) {
  return db.transaction(async (sql) => {
    await sql.exec("SET LOCAL ROLE beauty_app");
    await sql.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    if (verified)
      await sql.query("SELECT set_config('app.admin_verified','true',true)");
    return work(sql);
  });
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const authId of ["owner", "admin", "customer"]) {
    const user = await asUser(
      authId,
      (sql) =>
        enrolAccount(
          sql,
          {
            authId,
            email: `${authId}@example.test`,
            displayName: authId,
            secondFactorAge: null,
          },
          "customer",
        ),
      false,
    );
    if (authId !== "customer")
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,$2)",
        [user.id, authId],
      );
  }
});
afterAll(() => db.close());
const read = async () =>
  (
    await asUser("", (sql) =>
      sql.query<{ value: { enabled: boolean; hiddenSlugs: string[] } }>(
        "SELECT value FROM beauty.platform_settings WHERE key='profile_examples'",
      ),
    )
  ).rows[0].value;
const save = (
  enabled: boolean | null,
  hidden: (string | null)[] | null,
  who = "owner",
  verified = true,
) =>
  asUser(
    who,
    (sql) =>
      sql.query("SELECT beauty.owner_set_profile_examples($1,$2::text[])", [
        enabled,
        hidden,
      ]),
    verified,
  );
it("persists master and individual visibility, restores examples and audits each save", async () => {
  expect(await read()).toEqual({ enabled: true, hiddenSlugs: [] });
  await save(true, ["gloss-house", "gloss-house"]);
  expect(await read()).toEqual({ enabled: true, hiddenSlugs: ["gloss-house"] });
  await save(false, ["gloss-house"]);
  expect((await read()).enabled).toBe(false);
  await save(true, []);
  expect(await read()).toEqual({ enabled: true, hiddenSlugs: [] });
  expect(
    (
      await db.query(
        "SELECT id FROM beauty.admin_audit_logs WHERE action='profile_examples.visibility_updated'",
      )
    ).rows,
  ).toHaveLength(3);
});
it.each([
  ["admin", true],
  ["customer", true],
  ["owner", false],
  ["", true],
] as const)(
  "rejects non-owner or unverified access (%s %s)",
  async (who, verified) => {
    const before = await read();
    await expect(save(false, [], who, verified)).rejects.toThrow("FORBIDDEN");
    expect(await read()).toEqual(before);
  },
);
it.each([
  [null, []],
  [true, null],
  [true, [null]],
  [true, ["../gloss-house"]],
  [true, Array(11).fill("gloss-house")],
] as const)(
  "rejects malformed SQL input atomically (%j)",
  async (enabled, hidden) => {
    const before = await read();
    await expect(
      save(enabled, hidden as (string | null)[] | null),
    ).rejects.toThrow("INVALID_REQUEST");
    expect(await read()).toEqual(before);
  },
);
it("does not grant browser roles or catalog sessions privileged writes", async () => {
  for (const role of ["anon", "authenticated", "beauty_catalog"])
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_function_privilege($1,'beauty.owner_set_profile_examples(boolean,text[])','EXECUTE') AS allowed",
          [role],
        )
      ).rows[0].allowed,
    ).toBe(false);
  await expect(
    asUser("", (sql) =>
      sql.query(
        "UPDATE beauty.platform_settings SET value='{}' WHERE key='profile_examples'",
      ),
    ),
  ).rejects.toThrow();
});

import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = await createTestDatabase();
async function asUser<T>(
  authId: string,
  work: (sql: SqlClient) => Promise<T>,
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
const images = {
  desktop: {
    nails: "https://images.example.test/nails.webp",
    hair: "https://images.example.test/hair.webp",
  },
  mobile: { nails: "https://images.example.test/mobile.webp" },
};
const save = (value: unknown, who = "owner", verified = true) =>
  asUser(
    who,
    (sql) =>
      sql.query(
        "SELECT beauty.owner_set_homepage_category_images($1::jsonb,'Refresh category images')",
        [JSON.stringify(value)],
      ),
    verified,
  );
it("publishes saved categories through the public reader and keeps hero saves independent", async () => {
  await save(images);
  await asUser("owner", (sql) =>
    sql.query(
      "SELECT beauty.owner_set_homepage_media('https://images.example.test/hero.webp',NULL,'Refresh hero only')",
    ),
  );
  const publicMedia = await db.transaction(async (sql) => {
    await sql.exec("SET LOCAL ROLE beauty_catalog");
    return (
      await sql.query<{
        data: { desktopHero: string; categoryImages: typeof images };
      }>("SELECT beauty.public_homepage_media() AS data")
    ).rows[0].data;
  });
  expect(publicMedia.categoryImages).toEqual(images);
  expect(publicMedia.desktopHero).toBe("https://images.example.test/hero.webp");
  expect(
    (
      await db.query(
        "SELECT id FROM beauty.admin_audit_logs WHERE action='homepage_category_media_updated'",
      )
    ).rows,
  ).toHaveLength(1);
  await save({ ...images, desktop: { ...images.desktop, nails: null } });
  const data = (
    await db.query<{
      data: { desktopHero: string; categoryImages: typeof images };
    }>("SELECT beauty.public_homepage_media() AS data")
  ).rows[0].data;
  expect(data.desktopHero).toBe(publicMedia.desktopHero);
  expect(data.categoryImages.desktop.hair).toBe(images.desktop.hair);
  expect(data.categoryImages.desktop.nails).toBeNull();
  expect(data.categoryImages.mobile).toEqual(images.mobile);
});
it.each([
  ["admin", true],
  ["customer", true],
  ["owner", false],
] as const)(
  "requires a verified Owner (%s, verified=%s)",
  async (who, verified) => {
    await expect(save(images, who, verified)).rejects.toThrow("FORBIDDEN");
  },
);
it.each([
  null,
  [],
  { desktop: {}, mobile: [], tablet: {} },
  { desktop: {} },
  { desktop: { nails: "http://invalid.test/a.webp" }, mobile: {} },
  { desktop: { unknown: "https://invalid.test/a.webp" }, mobile: {} },
  { desktop: {}, mobile: { injectables: "https://invalid.test/a.webp" } },
  { desktop: { nails: false }, mobile: {} },
])("rejects invalid direct SQL writes atomically: %j", async (value) => {
  const before = (
    await db.query(
      "SELECT value FROM beauty.platform_settings WHERE key='homepage_category_media'",
    )
  ).rows;
  await expect(save(value)).rejects.toThrow("INVALID_REQUEST");
  expect(
    (
      await db.query(
        "SELECT value FROM beauty.platform_settings WHERE key='homepage_category_media'",
      )
    ).rows,
  ).toEqual(before);
});
it("does not grant privileged writes to Supabase browser roles", async () => {
  for (const role of ["anon", "authenticated", "beauty_catalog"]) {
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_function_privilege($1,'beauty.owner_set_homepage_category_images(jsonb,text)','EXECUTE') AS allowed",
          [role],
        )
      ).rows[0].allowed,
    ).toBe(false);
  }
});

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
const saveNames = (
  names: unknown,
  who = "owner",
  verified = true,
  photos: unknown = images,
) =>
  asUser(
    who,
    (sql) =>
      sql.query(
        "SELECT beauty.owner_set_homepage_categories($1::jsonb,$2::jsonb,'Rename homepage shortcuts')",
        [JSON.stringify(photos), JSON.stringify(names)],
      ),
    verified,
  );
it("publishes independent device names, preserves them on image-only and hero saves, and restores defaults", async () => {
  await saveNames({
    desktop: { nails: "  Nail art & care  " },
    mobile: { nails: "Gel nails" },
  });
  await save(images);
  await asUser("owner", (sql) =>
    sql.query(
      "SELECT beauty.owner_set_homepage_media(NULL,NULL,'Refresh hero only')",
    ),
  );
  const read = () =>
    db.transaction(async (sql) => {
      await sql.exec("SET LOCAL ROLE beauty_catalog");
      return (
        await sql.query<{
          data: { categoryNames: unknown; categoryImages: unknown };
        }>("SELECT beauty.public_homepage_media() AS data")
      ).rows[0].data;
    });
  expect((await read()).categoryNames).toEqual({
    desktop: { nails: "Nail art & care" },
    mobile: { nails: "Gel nails" },
  });
  expect((await read()).categoryImages).toEqual(images);
  expect(
    (
      await db.query(
        "SELECT id FROM beauty.admin_audit_logs WHERE action='homepage_category_names_updated'",
      )
    ).rows,
  ).toHaveLength(1);
  await saveNames({ desktop: { nails: null }, mobile: { nails: "Gel nails" } });
  expect((await read()).categoryNames).toEqual({
    desktop: { nails: null },
    mobile: { nails: "Gel nails" },
  });
});
it.each([
  ["admin", true],
  ["customer", true],
  ["owner", false],
] as const)(
  "requires a verified Owner for names (%s, %s)",
  async (who, verified) => {
    await expect(
      saveNames({ desktop: {}, mobile: {} }, who, verified),
    ).rejects.toThrow("FORBIDDEN");
  },
);
it.each([
  null,
  [],
  { desktop: {} },
  { desktop: {}, mobile: [], tablet: {} },
  { desktop: { nails: " " }, mobile: {} },
  { desktop: { nails: "x".repeat(61) }, mobile: {} },
  { desktop: { bad: "Beauty" }, mobile: {} },
  { desktop: {}, mobile: { barber: "Beauty" } },
  { desktop: { nails: false }, mobile: {} },
])(
  "rejects invalid names without changing names or photos: %j",
  async (names) => {
    const before = (
      await db.query(
        "SELECT key,value FROM beauty.platform_settings WHERE key IN ('homepage_category_names','homepage_category_media') ORDER BY key",
      )
    ).rows;
    await expect(
      saveNames(names, "owner", true, { desktop: {}, mobile: {} }),
    ).rejects.toThrow("INVALID_REQUEST");
    expect(
      (
        await db.query(
          "SELECT key,value FROM beauty.platform_settings WHERE key IN ('homepage_category_names','homepage_category_media') ORDER BY key",
        )
      ).rows,
    ).toEqual(before);
  },
);
it("rejects invalid photos without changing names, and keeps the new writer private", async () => {
  const before = (
    await db.query(
      "SELECT value FROM beauty.platform_settings WHERE key='homepage_category_names'",
    )
  ).rows;
  await expect(
    saveNames({ desktop: { nails: "New nails" }, mobile: {} }, "owner", true, {
      desktop: { nails: "http://bad.test/x" },
      mobile: {},
    }),
  ).rejects.toThrow("INVALID_REQUEST");
  expect(
    (
      await db.query(
        "SELECT value FROM beauty.platform_settings WHERE key='homepage_category_names'",
      )
    ).rows,
  ).toEqual(before);
  for (const role of ["anon", "authenticated", "beauty_catalog"]) {
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_function_privilege($1,'beauty.owner_set_homepage_categories(jsonb,jsonb,text)','EXECUTE') AS allowed",
          [role],
        )
      ).rows[0].allowed,
    ).toBe(false);
  }
});

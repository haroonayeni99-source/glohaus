import { beforeAll, afterAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import {
  updateProfile,
  publicProfessionals,
  publicProfile,
} from "@/modules/professionals/repository";
import {
  ownPublicLocation,
  savePublicLocation,
} from "@/modules/professionals/location-repository";
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";
import {
  coordinatesSchema,
  publicLocationSchema,
  distanceMiles,
  project,
  unproject,
  distanceLabel,
} from "@/modules/professionals/location";

const db = await createTestDatabase();
const ids: Record<string, string> = {};
const point = {
  latitude: 51.5074,
  longitude: -0.1278,
  source: "pin" as const,
  confirmed: true as const,
};
async function as<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const authId of ["geo-owner", "geo-other", "geo-draft"]) {
    const account = await as(authId, (sql) =>
      enrolAccount(
        sql,
        {
          authId,
          email: `${authId}@example.test`,
          displayName: authId,
          secondFactorAge: null,
        },
        "professional",
      ),
    );
    ids[authId] = account.professionalId!;
    await as(authId, (sql) =>
      updateProfile(sql, account.professionalId!, {
        slug: authId,
        businessName: authId,
        bio: "An independent professional with a public studio.",
        city: "London",
        category: "Hair",
        publicationStatus: authId === "geo-draft" ? "draft" : "published",
      }),
    );
  }
});
afterAll(() => db.close());
it("has no invented coordinates or distances for an existing area-only profile", async () => {
  const profile = await as("", (sql) => publicProfile(sql, "geo-owner"));
  expect(profile?.professional.public_latitude).toBeNull();
  expect(
    (await as("", (sql) => publicProfessionals(sql))).every(
      (row) => row.distance_miles === null,
    ),
  ).toBe(true);
});
it("requires explicit consent and finite complete coordinates", () => {
  for (const value of [
    { ...point, confirmed: false },
    { ...point, latitude: NaN },
    { ...point, longitude: 181 },
    { ...point, latitude: 86 },
    { latitude: 51, longitude: 0 },
    { ...point, userId: "forged" },
  ])
    expect(publicLocationSchema.safeParse(value).success).toBe(false);
  expect(publicLocationSchema.safeParse({ confirmed: false }).success).toBe(
    true,
  );
  expect(
    coordinatesSchema.safeParse({ latitude: 0, longitude: 0 }).success,
  ).toBe(true);
});
it("enforces ownership on insert, update and read without changing user roles", async () => {
  await expect(
    as("geo-other", (sql) => savePublicLocation(sql, ids["geo-owner"], point)),
  ).rejects.toThrow(/row-level security/);
  await as("geo-owner", (sql) =>
    savePublicLocation(sql, ids["geo-owner"], point),
  );
  await expect(
    as("geo-other", (sql) =>
      savePublicLocation(sql, ids["geo-owner"], { ...point, longitude: 0 }),
    ),
  ).rejects.toThrow(/row-level security/);
  expect(
    await as("geo-other", (sql) => ownPublicLocation(sql, ids["geo-owner"])),
  ).toBeNull();
  expect(
    await as("geo-owner", (sql) => ownPublicLocation(sql, ids["geo-owner"])),
  ).toMatchObject({ latitude: point.latitude, source: "pin" });
});
it("exposes confirmed points only on published active profiles", async () => {
  await as("geo-draft", (sql) =>
    savePublicLocation(sql, ids["geo-draft"], point),
  );
  expect(
    (
      await as("", (sql) =>
        sql.query("SELECT * FROM beauty.public_professional_locations"),
      )
    ).rows.map((row) => row.professional_id),
  ).toEqual([ids["geo-owner"]]);
  expect(
    (
      await as("", (sql) =>
        sql.query("SELECT * FROM beauty.professional_public_locations"),
      )
    ).rows,
  ).toEqual([]);
  await db.query(
    "UPDATE beauty.users SET status='suspended' WHERE auth_id='geo-owner'",
  );
  expect(
    (
      await as("", (sql) =>
        sql.query("SELECT * FROM beauty.public_professional_locations"),
      )
    ).rows,
  ).toEqual([]);
  await db.query(
    "UPDATE beauty.users SET status='active' WHERE auth_id='geo-owner'",
  );
});
it("calculates distance to actual points and applies all search filters and radius before limiting", async () => {
  await db.exec(`INSERT INTO beauty.users(auth_id,email,display_name) SELECT 'geo-directory-'||n,'geo-'||n||'@example.test','Map professional' FROM generate_series(1,30)n;
    INSERT INTO beauty.user_roles(user_id,role) SELECT id,'professional' FROM beauty.users WHERE auth_id LIKE 'geo-directory-%';
    INSERT INTO beauty.professional_profiles(user_id,slug,business_name,bio,city,category,publication_status) SELECT id,auth_id,CASE WHEN auth_id='geo-directory-30' THEN 'Z nearest studio' ELSE 'A studio' END,'An independent studio with a confirmed public pin.','London','Hair','published' FROM beauty.users WHERE auth_id LIKE 'geo-directory-%';
    INSERT INTO beauty.professional_public_locations SELECT id,CASE WHEN slug='geo-directory-30' THEN 51.5074 ELSE 52 END,CASE WHEN slug='geo-directory-30' THEN -0.128 ELSE -0.2 END,'pin',now() FROM beauty.professional_profiles WHERE slug LIKE 'geo-directory-%';`);
  const near = {
    latitude: 51.5074,
    longitude: -0.1278,
    radiusMiles: 10,
    query: "",
    filters: defaultDiscoveryFilters,
  };
  const rows = await as("", (sql) =>
    publicProfessionals(sql, "", undefined, near.filters, near),
  );
  expect(rows.map((row) => row.slug)).toEqual([
    "geo-owner",
    "geo-directory-30",
  ]);
  expect(rows[0].distance_miles).toBeLessThan(0.0001);
  expect(rows[1].distance_miles).toBeCloseTo(
    distanceMiles(near, { latitude: 51.5074, longitude: -0.128 }),
    4,
  );
  expect(
    await as("", (sql) =>
      publicProfessionals(
        sql,
        "",
        undefined,
        { ...near.filters, category: "Nails" },
        near,
      ),
    ),
  ).toEqual([]);
  expect(
    await as("", (sql) =>
      publicProfessionals(
        sql,
        "",
        undefined,
        { ...near.filters, location: "Manchester" },
        near,
      ),
    ),
  ).toEqual([]);
  expect(
    await as("", (sql) =>
      publicProfessionals(
        sql,
        "",
        undefined,
        { ...near.filters, verified: true },
        near,
      ),
    ),
  ).toEqual([]);
});
it("removes a public pin immediately without deleting the profile or changing its area", async () => {
  await as("geo-owner", (sql) =>
    savePublicLocation(sql, ids["geo-owner"], { confirmed: false }),
  );
  const profile = await as("", (sql) => publicProfile(sql, "geo-owner"));
  expect(profile?.professional.city).toBe("London");
  expect(profile?.professional.public_latitude).toBeNull();
  expect(
    await as("geo-owner", (sql) => ownPublicLocation(sql, ids["geo-owner"])),
  ).toBeNull();
});
it("blocks incomplete database points and raw public role access", async () => {
  await expect(
    db.query(
      "UPDATE beauty.professional_public_locations SET latitude=51 WHERE professional_id=$1",
      [ids["geo-owner"]],
    ),
  ).rejects.toThrow(/public_location_complete/);
  for (const role of ["anon", "authenticated"]) {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE ${role}`);
        await tx.query("SELECT * FROM beauty.professional_public_locations");
      }),
    ).rejects.toThrow(/permission denied/);
  }
});
it("uses stable map projection and straight-line distance at zero, poles and date line", () => {
  for (const p of [
    { latitude: 51.5074, longitude: -0.1278 },
    { latitude: 0, longitude: 0 },
    { latitude: 85, longitude: 179.9 },
    { latitude: -85, longitude: -179.9 },
  ]) {
    const xy = project(p, 17),
      result = unproject(xy.x, xy.y, 17);
    expect(result.latitude).toBeCloseTo(p.latitude, 6);
    expect(result.longitude).toBeCloseTo(p.longitude, 6);
    expect(distanceMiles(p, p)).toBe(0);
  }
  expect(
    distanceMiles(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    ),
  ).toBeCloseTo(13.819, 2);
  expect(distanceLabel(1.42)).toBe("1.4 miles away");
  expect(distanceLabel(0.01)).toBe("Less than 0.1 miles away");
});

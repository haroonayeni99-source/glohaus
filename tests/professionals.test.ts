import {
  discoveryOptions,
  discoveryCursor,
  type DiscoveryCursor,
} from "@/modules/professionals/discovery";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { profileSchema, serviceSchema } from "@/modules/professionals/domain";
import {
  deactivateService,
  updateProfile,
  saveService,
  publicProfessionals,
  publicProfile,
  discoveryPage,
} from "@/modules/professionals/repository";
const db = new PGlite();
let ownerId: string;
let otherId: string;
let serviceId: string;
async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}
const profile = {
  slug: "alice-studio",
  businessName: "Alice Studio",
  bio: "An independent nail artist based in London.",
  city: "London",
  category: "Nails" as const,
  publicationStatus: "published" as const,
};
const service = {
  name: "Gel manicure",
  description: "A carefully finished gel manicure",
  durationMinutes: 60,
  pricePence: 4500,
  depositPence: 1500,
  active: true,
};
beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  for (const authId of ["alice", "bob"]) {
    const account = await asUser(authId, (sql) =>
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
    if (authId === "alice") ownerId = account.professionalId!;
    else otherId = account.professionalId!;
  }
});
afterAll(() => db.close());
describe.sequential("professional publishing and private ownership", () => {
  it("hides drafts from anonymous discovery", async () => {
    expect(await asUser("", (sql) => publicProfessionals(sql))).toEqual([]);
  });
  it("allows owner publishing with a safe public projection", async () => {
    await asUser("alice", (sql) => updateProfile(sql, ownerId, profile));
    const results = await asUser("", (sql) => publicProfessionals(sql));
    expect(results).toHaveLength(1);
    expect(Object.keys(results[0]).sort()).toEqual([
      "bio",
      "business_name",
      "category",
      "city",
      "from_price_pence",
      "id",
      "photo_alt",
      "photo_id",
      "rating",
      "review_count",
      "slug",
    ]);
  });
  it("cannot change another professional even with their ID", async () => {
    await expect(
      asUser("bob", (sql) =>
        updateProfile(sql, ownerId, { ...profile, businessName: "Forged" }),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("does not grant anonymous access to raw private profiles or identities", async () => {
    expect(
      (
        await asUser("", (sql) =>
          sql.query("SELECT * FROM beauty.professional_profiles"),
        )
      ).rows,
    ).toEqual([]);
    expect(
      (await asUser("", (sql) => sql.query("SELECT email FROM beauty.users")))
        .rows,
    ).toEqual([]);
  });
  it("public view owner cannot access emails", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE beauty_catalog");
        await tx.query("SELECT email FROM beauty.users");
      }),
    ).rejects.toThrow(/permission denied/);
  });
  it("creates services tied to the verified owner", async () => {
    serviceId = (
      await asUser("alice", (sql) => saveService(sql, ownerId, service))
    ).id as string;
    expect(
      (await asUser("", (sql) => publicProfile(sql, "alice-studio")))
        ?.services[0].deposit_pence,
    ).toBe(1500);
  });
  it("finds professionals by published service name and shows truthful card data", async () => {
    const rows = await asUser("", (sql) =>
      publicProfessionals(sql, "Gel manicure"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: ownerId,
      from_price_pence: 4500,
      rating: null,
      review_count: 0,
      photo_id: null,
    });
    expect(await asUser("", (sql) => publicProfessionals(sql, "%"))).toEqual(
      [],
    );
  });
  it("rejects cross-owner service creation and editing", async () => {
    await expect(
      asUser("bob", (sql) => saveService(sql, ownerId, service)),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser("bob", (sql) => saveService(sql, otherId, service, serviceId)),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("archiving removes a service publicly but keeps owner history", async () => {
    await asUser("alice", (sql) =>
      saveService(sql, ownerId, { ...service, active: false }, serviceId),
    );
    expect(
      (await asUser("", (sql) => publicProfile(sql, "alice-studio")))?.services,
    ).toEqual([]);
    expect(
      (
        await asUser("alice", (sql) =>
          sql.query("SELECT id FROM beauty.services"),
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("does not discover a professional through an archived service", async () => {
    expect(
      await asUser("", (sql) => publicProfessionals(sql, "Gel manicure")),
    ).toEqual([]);
    const rows = await asUser("", (sql) => publicProfessionals(sql, "Nails"));
    expect(rows).toHaveLength(1);
    expect(rows[0].from_price_pence).toBeNull();
  });
  it("suspension immediately hides public profiles", async () => {
    await db.query(
      "UPDATE beauty.users SET status='suspended' WHERE auth_id='alice'",
    );
    expect(await asUser("", (sql) => publicProfessionals(sql))).toEqual([]);
    await expect(
      asUser("alice", (sql) => updateProfile(sql, ownerId, profile)),
    ).rejects.toThrow("FORBIDDEN");
  });
});
it("rejects malformed profiles and forged owner identifiers", () => {
  expect(
    profileSchema.safeParse({ ...profile, slug: "../../admin" }).success,
  ).toBe(false);
  expect(
    profileSchema.safeParse({ ...profile, professionalId: "someone-else" })
      .success,
  ).toBe(false);
});
it("validates money in integer pence and sensible duration", () => {
  expect(
    serviceSchema.safeParse({ ...service, depositPence: 5000 }).success,
  ).toBe(false);
  expect(
    serviceSchema.safeParse({ ...service, pricePence: 45.5 }).success,
  ).toBe(false);
  expect(
    serviceSchema.safeParse({ ...service, durationMinutes: 16 }).success,
  ).toBe(false);
});

describe.sequential("public directory pagination", () => {
  it("makes more than sixty matching professionals reachable without duplicates", async () => {
    await db.exec(`INSERT INTO beauty.users(auth_id,email,display_name) SELECT 'directory-'||n,'directory-'||n||'@example.test','Directory professional' FROM generate_series(1,65)n;
   INSERT INTO beauty.user_roles(user_id,role) SELECT id,'professional' FROM beauty.users WHERE auth_id LIKE 'directory-%';
   INSERT INTO beauty.professional_profiles(user_id,slug,business_name,bio,city,category,publication_status) SELECT id,auth_id,'Same Studio','An independent studio with careful attention to detail.','Leeds','Nails','published' FROM beauty.users WHERE auth_id LIKE 'directory-%';`);
    const ids: string[] = [];
    let after: DiscoveryCursor | undefined;
    for (let page = 0; page < 4; page++) {
      const result = await asUser("", (sql) =>
        discoveryPage(sql, "Same Studio", after),
      );
      ids.push(...result.professionals.map((p) => p.id));
      if (!result.next) break;
      after = discoveryOptions({ q: "Same Studio", after: result.next }).after;
    }
    expect(ids).toHaveLength(65);
    expect(new Set(ids).size).toBe(65);
  });
  it("excludes newly hidden and suspended profiles on every results page", async () => {
    await db.exec(
      "UPDATE beauty.professional_profiles SET publication_status='hidden' WHERE slug='directory-1';UPDATE beauty.users SET status='suspended' WHERE auth_id='directory-2'",
    );
    const slugs: string[] = [];
    let after: DiscoveryCursor | undefined;
    for (let page = 0; page < 4; page++) {
      const result = await asUser("", (sql) =>
        discoveryPage(sql, "Same Studio", after),
      );
      slugs.push(...result.professionals.map((p) => p.slug));
      if (!result.next) break;
      after = discoveryOptions({ q: "Same Studio", after: result.next }).after;
    }
    expect(slugs).toHaveLength(63);
    expect(slugs).not.toContain("directory-1");
    expect(slugs).not.toContain("directory-2");
  });
});
it("resets pagination for changed searches and malformed cursors", () => {
  const cursor = discoveryCursor(
    { id: "00000000-0000-4000-8000-000000000001", business_name: "Studio" },
    "Nails",
  );
  expect(discoveryOptions({ q: "Hair", after: cursor })).toEqual({
    query: "Hair",
    after: undefined,
  });
  expect(discoveryOptions({ q: ["Nails"], after: "broken" })).toEqual({
    query: "",
    after: undefined,
  });
  expect(discoveryOptions({ q: " Nails ", after: cursor }).after?.name).toBe(
    "Studio",
  );
  expect(discoveryOptions({ after: "x".repeat(1401) }).after).toBeUndefined();
});

describe.sequential("service image management", () => {
  let image: string;
  let managed: string;
  it("allows an owned image without exposing a draft", async () => {
    await db.query(
      "UPDATE beauty.users SET status='active' WHERE auth_id='alice'",
    );
    image = (
      await asUser("alice", (sql) =>
        sql.query<{ id: string }>(
          "INSERT INTO beauty.portfolio_assets(professional_id,blob_path,alt_text) VALUES($1,'services/example.webp','A braided hairstyle') RETURNING id",
          [ownerId],
        ),
      )
    ).rows[0].id;
    await asUser("alice", (sql) => updateProfile(sql, ownerId, profile));
    managed = (
      await asUser("alice", (sql) =>
        saveService(sql, ownerId, {
          ...service,
          name: "Braids",
          pricePence: 8000,
          durationMinutes: 150,
          assetId: image,
        }),
      )
    ).id as string;
    const menu = await asUser("", (sql) => publicProfile(sql, profile.slug));
    expect(menu?.services.find((s) => s.id === managed)?.asset_id).toBeNull();
  });
  it("shows only published images and removes hidden image references", async () => {
    await asUser("alice", (sql) =>
      sql.query(
        "UPDATE beauty.portfolio_assets SET publication_status='published' WHERE id=$1",
        [image],
      ),
    );
    expect(
      (
        await asUser("", (sql) => publicProfile(sql, profile.slug))
      )?.services.find((s) => s.id === managed),
    ).toMatchObject({ asset_id: image, image_alt: "A braided hairstyle" });
    await asUser("alice", (sql) =>
      sql.query(
        "UPDATE beauty.portfolio_assets SET publication_status='hidden' WHERE id=$1",
        [image],
      ),
    );
    expect(
      (
        await asUser("", (sql) => publicProfile(sql, profile.slug))
      )?.services.find((s) => s.id === managed)?.asset_id,
    ).toBeNull();
  });
  it("rejects another professional's image, edits and deactivation", async () => {
    await expect(
      asUser("bob", (sql) =>
        saveService(sql, otherId, { ...service, assetId: image }),
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asUser("bob", (sql) => deactivateService(sql, otherId, managed)),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asUser("bob", (sql) => deactivateService(sql, ownerId, managed)),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("deactivates without deleting and allows reactivation with edited details", async () => {
    await asUser("alice", (sql) => deactivateService(sql, ownerId, managed));
    expect(
      (
        await asUser("", (sql) => publicProfile(sql, profile.slug))
      )?.services.some((s) => s.id === managed),
    ).toBe(false);
    expect(
      (
        await asUser("alice", (sql) =>
          sql.query("SELECT id FROM beauty.services WHERE id=$1", [managed]),
        )
      ).rows,
    ).toHaveLength(1);
    await asUser("alice", (sql) =>
      saveService(
        sql,
        ownerId,
        {
          ...service,
          name: "Lash Extensions",
          pricePence: 6000,
          durationMinutes: 120,
          assetId: null,
        },
        managed,
      ),
    );
    expect(
      (
        await asUser("", (sql) => publicProfile(sql, profile.slug))
      )?.services.find((s) => s.id === managed),
    ).toMatchObject({
      name: "Lash Extensions",
      price_pence: 6000,
      duration_minutes: 120,
      asset_id: null,
    });
  });
  it.each([
    { pricePence: -1 },
    { durationMinutes: 0 },
    { durationMinutes: 151 },
    { description: "x".repeat(501) },
    { assetId: "https://example.com/image" },
    { active: "true" },
    { professionalId: "forged" },
  ])("rejects invalid service fields %j", (invalid) => {
    expect(serviceSchema.safeParse({ ...service, ...invalid }).success).toBe(
      false,
    );
  });
});

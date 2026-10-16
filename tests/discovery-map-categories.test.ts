import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import {
  updateProfile,
  saveService,
  publicProfessionals,
} from "@/modules/professionals/repository";
import {
  saveProduct,
  publicProducts,
  productCategories,
} from "@/modules/shop/repository";
vi.mock("@/lib/db", () => ({
  withIdentity: async <T>(id: string, work: (db: SqlClient) => Promise<T>) =>
    as(id, work),
}));
import { GET as quickView } from "@/app/api/v1/explore/professionals/[slug]/route";
const db = await createTestDatabase();
let proId: string, productId: string, categoryId: string, serviceId: string;
async function as<T>(
  id: string,
  work: (sql: SqlClient) => Promise<T>,
  verified = false,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [id]);
    if (verified)
      await tx.query("SELECT set_config('app.admin_verified','true',true)");
    return work(tx);
  });
}
const product = {
  name: "Unscented finishing blend",
  description: "An accurate product description without category keywords.",
  sku: null,
  pricePence: 2500,
  stockQuantity: 4,
  imageAssetId: null,
  publicationStatus: "published" as const,
};
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const id of ["map-pro", "map-owner", "map-outsider"]) {
    const a = await as(id, (sql) =>
      enrolAccount(
        sql,
        {
          authId: id,
          email: id + "@example.test",
          displayName: id,
          secondFactorAge: 0,
        },
        id === "map-pro" ? "professional" : "customer",
      ),
    );
    if (id === "map-pro") {
      proId = a.professionalId!;
      await as(id, (sql) =>
        updateProfile(sql, proId, {
          slug: "map-professional",
          businessName: "Map Studio",
          bio: "A published beauty studio with genuine services.",
          city: "London",
          category: "Hair",
          publicationStatus: "published",
        }),
      );
    }
    if (id === "map-owner")
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner')",
        [a.id],
      );
  }
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [proId],
  );
});
afterAll(() => db.close());
describe.sequential("shared discovery and product catalogue", () => {
  it("allows only verified Owner/Admin to create product categories without creating a service category or duplicate slug", async () => {
    await expect(
      as(
        "map-outsider",
        (sql) =>
          sql.query(
            "SELECT beauty.admin_upsert_product_category(NULL,'Scalp care','scalp-care',true,20,'Add scalp care category')",
          ),
        true,
      ),
    ).rejects.toThrow("FORBIDDEN");
    const create = () =>
      as(
        "map-owner",
        async (sql) =>
          (
            await sql.query<{ id: string }>(
              "SELECT beauty.admin_upsert_product_category(NULL,'Scalp care','scalp-care',true,20,'Add scalp care category') AS id",
            )
          ).rows[0].id,
        true,
      );
    categoryId = await create();
    expect(await create()).toBe(categoryId);
    expect(
      (
        await db.query(
          "SELECT active,product_enabled FROM beauty.platform_categories WHERE id=$1",
          [categoryId],
        )
      ).rows[0],
    ).toMatchObject({ active: false, product_enabled: true });
    expect(
      (
        await db.query(
          "SELECT action FROM beauty.admin_audit_logs WHERE action='product_category.updated'",
        )
      ).rows.length,
    ).toBeGreaterThan(0);
  });
  it("saves a category on the existing product and filters by its ID rather than guessing words", async () => {
    productId = (
      await as("map-pro", (sql) =>
        saveProduct(sql, proId, { ...product, categoryId }),
      )
    ).id;
    const filtered = await as("", (sql) => publicProducts(sql, { categoryId }));
    expect(filtered.map((p) => p.id)).toContain(productId);
    expect(filtered[0].category_id).toBe(categoryId);
    expect(
      (await as("", (sql) => publicProducts(sql, { query: "Scalp care" }))).map(
        (p) => p.id,
      ),
    ).not.toContain(productId);
  });
  it("removes a category from browsing without removing its products and rejects new assignments to hidden categories", async () => {
    await as(
      "map-owner",
      (sql) =>
        sql.query(
          "SELECT beauty.admin_upsert_product_category($1,'Scalp care','scalp-care',false,20,'Remove from Shop browsing')",
          [categoryId],
        ),
      true,
    );
    expect(
      (await as("", (sql) => productCategories(sql))).some(
        (c) => c.id === categoryId,
      ),
    ).toBe(false);
    expect(
      await as("", (sql) => publicProducts(sql, { categoryId })),
    ).toHaveLength(0);
    expect(
      (await as("", (sql) => publicProducts(sql))).some(
        (p) => p.id === productId,
      ),
    ).toBe(true);
    await expect(
      as("map-pro", (sql) =>
        saveProduct(sql, proId, { ...product, categoryId }),
      ),
    ).rejects.toThrow("INVALID_PRODUCT_CATEGORY");
    expect(
      (
        await as("map-pro", (sql) =>
          saveProduct(
            sql,
            proId,
            { ...product, categoryId, stockQuantity: 3 },
            productId,
          ),
        )
      )?.stock_quantity,
    ).toBe(3);
    await as(
      "map-owner",
      (sql) =>
        sql.query(
          "SELECT beauty.admin_upsert_product_category($1,'Scalp & hair care','scalp-care',true,5,'Rename and restore category')",
          [categoryId],
        ),
      true,
    );
    expect(
      (await as("", (sql) => productCategories(sql))).find(
        (c) => c.id === categoryId,
      )?.name,
    ).toBe("Scalp & hair care");
  });
  it("does not allow another account to relabel a professional's product", async () => {
    const row = await as("map-outsider", (sql) =>
      saveProduct(sql, proId, { ...product, categoryId: null }, productId),
    );
    expect(row).toBeNull();
    expect(
      (
        await db.query<{ category_id: string }>(
          "SELECT category_id FROM beauty.products WHERE id=$1",
          [productId],
        )
      ).rows[0].category_id,
    ).toBe(categoryId);
  });
  it("uses existing calendar hours and blocks for the next available appointment without exposing booking data", async () => {
    serviceId = (
      await as("map-pro", (sql) =>
        saveService(sql, proId, {
          name: "Scalp appointment",
          description: "A full consultation and treatment.",
          durationMinutes: 60,
          pricePence: 4500,
          depositPence: 1500,
          active: true,
        }),
      )
    ).id;
    const day = (
      await db.query<{ day: string }>(
        "SELECT ((now() AT TIME ZONE 'Europe/London')::date+1)::text AS day",
      )
    ).rows[0].day;
    await db.query(
      "INSERT INTO beauty.availability_rules(professional_id,weekday,start_minute,end_minute) VALUES($1,extract(dow FROM $2::date)::integer,540,720)",
      [proId, day],
    );
    const slot = () =>
      as(
        "",
        async (sql) =>
          (
            await sql.query<{ slot: string | Date }>(
              "SELECT beauty.public_next_service_slot($1,$2::date) AS slot",
              [serviceId, day],
            )
          ).rows[0].slot,
      );
    const expected = (
      await db.query<{ slot: string | Date }>(
        "SELECT ($1::date+time '09:00') AT TIME ZONE 'Europe/London' AS slot",
        [day],
      )
    ).rows[0].slot;
    expect(new Date(await slot()).getTime()).toBe(new Date(expected).getTime());
    await db.query(
      "INSERT INTO beauty.availability_blocks(professional_id,starts_at,ends_at,label) VALUES($1,($2::date+time '09:00') AT TIME ZONE 'Europe/London',($2::date+time '10:00') AT TIME ZONE 'Europe/London','Private blocked time')",
      [proId, day],
    );
    expect(new Date(await slot()).getTime()).toBe(
      new Date(expected).getTime() + 3600000,
    );
    const rows = await as("", (sql) => publicProfessionals(sql));
    const found = rows.find((p) => p.id === proId);
    expect(found?.next_available_at).toBeTruthy();
    expect(JSON.stringify(found)).not.toContain("Private blocked time");
  });
  it("loads quick view through its real public handler without leaking private contact or unpublished profiles", async () => {
    await db.query(
      "UPDATE beauty.professional_profiles SET contact_email='private-contact@example.test',contact_phone='07000000000' WHERE id=$1",
      [proId],
    );
    const request = new Request(
      "https://glohaus.test/api/v1/explore/professionals/map-professional",
    );
    const response = await quickView(request, {
      params: Promise.resolve({ slug: "map-professional" }),
    });
    expect(response.status).toBe(200);
    const preview = await response.json();
    expect(
      preview.services.some((s: { id: string }) => s.id === serviceId),
    ).toBe(true);
    expect(JSON.stringify(preview)).not.toContain("private-contact");
    expect(JSON.stringify(preview)).not.toContain("07000000000");
    expect(preview).not.toHaveProperty("details");
    await db.query(
      "UPDATE beauty.professional_profiles SET publication_status='draft' WHERE id=$1",
      [proId],
    );
    expect(
      (
        await quickView(request, {
          params: Promise.resolve({ slug: "map-professional" }),
        })
      ).status,
    ).toBe(404);
    await db.query(
      "UPDATE beauty.professional_profiles SET publication_status='published' WHERE id=$1",
      [proId],
    );
  });
  it("does not expose next slots for unpublished services or privileged functions to Data API roles", async () => {
    await db.query("UPDATE beauty.services SET active=false WHERE id=$1", [
      serviceId,
    ]);
    expect(
      (
        await as("", (sql) =>
          sql.query<{ slot: string | null }>(
            "SELECT beauty.public_next_service_slot($1,(now() AT TIME ZONE 'Europe/London')::date) AS slot",
            [serviceId],
          ),
        )
      ).rows[0].slot,
    ).toBeNull();
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_function_privilege('anon','beauty.admin_upsert_product_category(uuid,text,text,boolean,integer,text)','EXECUTE') OR has_function_privilege('authenticated','beauty.public_next_service_slot(uuid,date)','EXECUTE') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
});

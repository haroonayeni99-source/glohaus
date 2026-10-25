import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
const db = await createTestDatabase();
let professional: string;
let teeth: string;
let tattoos: string;
let normalService: string;
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const [auth, role] of [
    ["regulated-owner", "owner"],
    ["regulated-admin", "admin"],
    ["regulated-pro", "professional"],
  ]) {
    const user = (
      await db.query<{ id: string }>(
        "INSERT INTO beauty.users(auth_id,email,display_name) VALUES($1,$2,$1) RETURNING id",
        [auth, `${auth}@example.test`],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,$2)",
      [user, role],
    );
    if (role === "owner")
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
        [user],
      );
    if (role === "professional")
      professional = (
        await db.query<{ id: string }>(
          "INSERT INTO beauty.professional_profiles(user_id,publication_status,slug,business_name,bio,city) VALUES($1,'published','regulated-studio','Fixture Studio','Complete fictional studio profile for isolated tests.','London') RETURNING id",
          [user],
        )
      ).rows[0].id;
  }
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status,standing_status) VALUES($1,'verified','good') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [professional],
  );
  teeth = (
    await db.query<{ id: string }>(
      "SELECT id FROM beauty.platform_categories WHERE slug='teeth-whitening'",
    )
  ).rows[0].id;
  tattoos = (
    await db.query<{ id: string }>(
      "SELECT id FROM beauty.platform_categories WHERE slug='tattoos'",
    )
  ).rows[0].id;
  normalService = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,duration_minutes,price_pence,deposit_pence,category) VALUES($1,'Existing Hair',60,5000,1500,'Hair') RETURNING id",
      [professional],
    )
  ).rows[0].id;
});
afterAll(() => db.close());
async function isolated(work: () => Promise<void>) {
  await db.exec("BEGIN");
  try {
    await work();
  } finally {
    await db.exec("ROLLBACK");
  }
}
async function as<T>(auth: string, work: () => Promise<T>, verified = true) {
  await db.exec("SAVEPOINT actor");
  try {
    await db.exec("SET LOCAL ROLE beauty_app");
    await db.query(
      "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
      [auth, String(verified)],
    );
    const value = await work();
    await db.exec("RESET ROLE; RELEASE SAVEPOINT actor");
    return value;
  } catch (error) {
    await db.exec(
      "ROLLBACK TO SAVEPOINT actor; RESET ROLE; RELEASE SAVEPOINT actor",
    );
    throw error;
  }
}
const payload = (categoryId = teeth) => ({
  professionalId: professional,
  categoryId,
  status: "approved",
  registrationReference: "123456",
  validUntil: new Date(Date.now() + 86400000 * 60).toISOString().slice(0, 10),
  registerChecked: true,
  insuranceChecked: true,
  safeguardsChecked: true,
  dentistConfirmed: true,
  reason: "Checked fictional registry, insurance and safeguards.",
});
async function approve(input: object = payload()) {
  return as("regulated-owner", () =>
    db.query("SELECT beauty.owner_set_regulatory_clearance($1::jsonb)", [
      JSON.stringify(input),
    ]),
  );
}
async function open(category = teeth, actor = "regulated-owner") {
  const c = (
    await db.query<{
      name: string;
      slug: string;
      description: string;
      sort_order: number;
    }>("SELECT * FROM beauty.platform_categories WHERE id=$1", [category])
  ).rows[0];
  return as(actor, () =>
    db.query("SELECT beauty.admin_update_taxonomy($1::jsonb)", [
      JSON.stringify({
        operation: "category",
        id: category,
        name: c.name,
        slug: c.slug,
        description: c.description,
        imageUrl: null,
        active: true,
        sortOrder: c.sort_order,
        aliases: [],
        reason: "Open this category after an Owner launch decision.",
      }),
    ]),
  );
}
async function permitted(category = teeth) {
  return (
    await db.query<{ allowed: boolean }>(
      "SELECT beauty.regulatory_service_allowed($1,$2) AS allowed",
      [professional, category],
    )
  ).rows[0].allowed;
}

it("prepares both categories hidden, keeps Makeup active and adds Editorial without removing existing templates", () =>
  isolated(async () => {
    expect(
      (
        await db.query(
          "SELECT slug FROM beauty.platform_categories WHERE slug IN('teeth-whitening','tattoos') AND NOT active",
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await db.query(
          "SELECT 1 FROM beauty.platform_categories WHERE slug='makeup' AND active",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "SELECT slug FROM beauty.service_templates WHERE slug IN('soft-glam','full-glam','bridal-makeup-application','editorial-makeup-session')",
        )
      ).rows,
    ).toHaveLength(4);
    const catalog = (
      await db.query<{ data: { categories: { id: string }[] } }>(
        "SELECT beauty.taxonomy_catalog(false) AS data",
      )
    ).rows[0].data;
    expect(
      catalog.categories.some((c) => [teeth, tattoos].includes(c.id)),
    ).toBe(false);
  }));
it("keeps private evidence inaccessible and requires Owner plus verified admin challenge", () =>
  isolated(async () => {
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_table_privilege('beauty_app','beauty.professional_regulatory_clearances','SELECT') OR has_table_privilege('anon','beauty.regulatory_categories','SELECT') OR has_function_privilege('authenticated','beauty.owner_set_regulatory_clearance(jsonb)','EXECUTE') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    await expect(
      as("regulated-admin", () =>
        db.query("SELECT beauty.owner_regulatory_overview()"),
      ),
    ).rejects.toThrow();
    await expect(
      as(
        "regulated-owner",
        () => db.query("SELECT beauty.owner_regulatory_overview()"),
        false,
      ),
    ).rejects.toThrow();
    await expect(
      as("regulated-admin", () =>
        db.query("SELECT beauty.owner_set_regulatory_clearance($1::jsonb)", [
          JSON.stringify(payload()),
        ]),
      ),
    ).rejects.toThrow();
    await expect(open(teeth, "regulated-admin")).rejects.toThrow("FORBIDDEN");
  }));
it("requires category launch and separately approved evidence; expiry, revocation and verification loss close eligibility", () =>
  isolated(async () => {
    expect(await permitted()).toBe(false);
    await approve();
    expect(await permitted()).toBe(false);
    await open();
    expect(await permitted()).toBe(true);
    await db.query(
      "UPDATE beauty.professional_regulatory_clearances SET valid_until=now()-interval '1 second' WHERE professional_id=$1",
      [professional],
    );
    expect(await permitted()).toBe(false);
    await approve();
    await db.query(
      "UPDATE beauty.professional_trust_status SET verification_status='unverified' WHERE professional_id=$1",
      [professional],
    );
    expect(await permitted()).toBe(false);
    await db.query(
      "UPDATE beauty.professional_trust_status SET verification_status='verified' WHERE professional_id=$1",
      [professional],
    );
    await approve({
      professionalId: professional,
      categoryId: teeth,
      status: "revoked",
      reason: "Insurance approval withdrawn after review.",
    });
    expect(await permitted()).toBe(false);
    expect(
      (
        await db.query(
          "SELECT 1 FROM beauty.admin_audit_logs WHERE action='regulatory.clearance'",
        )
      ).rows.length,
    ).toBeGreaterThan(0);
  }));
it("rejects incomplete checks, non-dentists, invalid registration, expired approval and unverified providers", () =>
  isolated(async () => {
    for (const change of [
      { registerChecked: false },
      { insuranceChecked: false },
      { safeguardsChecked: false },
      { dentistConfirmed: false },
      { registrationReference: "not-a-GDC-number" },
      { validUntil: "2020-01-01" },
    ])
      await expect(approve({ ...payload(), ...change })).rejects.toThrow();
    await db.query(
      "UPDATE beauty.professional_trust_status SET verification_status='unverified' WHERE professional_id=$1",
      [professional],
    );
    await expect(approve()).rejects.toThrow();
  }));
it("enforces tattoo approval independently and keeps other categories, quotes and prices unchanged", () =>
  isolated(async () => {
    await open(tattoos);
    expect(await permitted(tattoos)).toBe(false);
    await approve({
      ...payload(tattoos),
      registrationReference: "Council provider A / premises B",
      dentistConfirmed: false,
    });
    expect(await permitted(tattoos)).toBe(true);
    expect(await permitted(teeth)).toBe(false);
    const before = (
      await db.query<{ data: { pricePence: number; depositPence: number } }>(
        "SELECT beauty.service_quote($1) AS data",
        [normalService],
      )
    ).rows[0].data;
    expect(before).toMatchObject({ pricePence: 5000, depositPence: 1500 });
    expect(
      (
        await db.query("SELECT 1 FROM beauty.public_services WHERE id=$1", [
          normalService,
        ])
      ).rows,
    ).toHaveLength(1);
  }));
it("blocks publishing and direct booking/quote bypasses until approved and hides expired regulated services", () =>
  isolated(async () => {
    const service = (
      await db.query<{ id: string }>(
        "INSERT INTO beauty.services(professional_id,name,duration_minutes,price_pence,deposit_pence,category_id,active,publication_status) VALUES($1,'Future whitening consultation',30,5000,1500,$2,false,'draft') RETURNING id",
        [professional, teeth],
      )
    ).rows[0].id;
    await expect(
      as("regulated-pro", () =>
        db.query(
          "UPDATE beauty.services SET active=true,publication_status='published' WHERE id=$1",
          [service],
        ),
      ),
    ).rejects.toThrow();
    await approve();
    await open();
    await db.query(
      "UPDATE beauty.services SET active=true,publication_status='published' WHERE id=$1",
      [service],
    );
    expect(
      (
        await db.query("SELECT 1 FROM beauty.public_services WHERE id=$1", [
          service,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ data: { pricePence: number } }>(
          "SELECT beauty.service_quote($1) AS data",
          [service],
        )
      ).rows[0].data.pricePence,
    ).toBe(5000);
    await approve({
      professionalId: professional,
      categoryId: teeth,
      status: "revoked",
      reason: "Reviewed evidence no longer current.",
    });
    expect(
      (
        await db.query("SELECT 1 FROM beauty.public_services WHERE id=$1", [
          service,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(
      as("regulated-pro", () =>
        db.query("SELECT beauty.service_quote($1)", [service]),
      ),
    ).rejects.toThrow("UNAVAILABLE_SERVICE");
    await expect(
      db.query(
        "INSERT INTO beauty.bookings(service_id,professional_id) VALUES($1,$2)",
        [service, professional],
      ),
    ).rejects.toThrow("UNAVAILABLE_SERVICE");
  }));

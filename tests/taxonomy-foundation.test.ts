import { afterAll, beforeAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { migrationPlan } from "../scripts/migration-plan.mjs";
import { createTestDatabase } from "./test-database";
import { enrolAccount } from "@/modules/accounts/repository";
const db = await createTestDatabase();
let pro: string;
let service: string;
let category: string;
beforeAll(async () => {
  const migrations = await migrationPlan();
  const latest = migrations.find(
    (m) => m.name === "20261015023135_multi_speciality_catalogue.sql",
  )!;
  for (const m of migrations.slice(0, migrations.indexOf(latest)))
    await db.exec(await readFile(m.url, "utf8"));
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id','legacy-hair',true)");
    pro = (
      await enrolAccount(
        tx,
        {
          authId: "legacy-hair",
          email: "legacy@example.test",
          displayName: "Legacy Hair",
          secondFactorAge: null,
        },
        "professional",
      )
    ).professionalId!;
  });
  await db.query(
    "UPDATE beauty.professional_profiles SET category='Hair',bio='Existing profile information is preserved',business_name='Legacy Hair' WHERE id=$1",
    [pro],
  );
  category = (
    await db.query<{ id: string }>(
      "SELECT id FROM beauty.platform_categories WHERE name='Hair'",
    )
  ).rows[0].id;
  service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence,active,category) VALUES($1,'Existing Hair Service','Original description',60,5000,1500,true,'Hair') RETURNING id",
      [pro],
    )
  ).rows[0].id;
  await db.exec(await readFile(latest.url, "utf8"));
});
afterAll(() => db.close());
it("adds canonical references without assigning existing professional specialities", async () => {
  const result = await db.query<{ name: string; template: string }>(
    "SELECT s.name,t.name AS template FROM beauty.specialities s JOIN beauty.service_templates t ON t.speciality_id=s.id JOIN beauty.platform_categories c ON c.id=s.category_id WHERE c.taxonomy_key='hair' AND t.slug IN('knotless-braids','retwist') ORDER BY t.slug",
  );
  expect(result.rows).toEqual([
    { name: "Braiding", template: "Knotless Braids" },
    { name: "Locs", template: "Retwist" },
  ]);
  expect(
    (await db.query("SELECT * FROM beauty.professional_specialities")).rows,
  ).toHaveLength(0);
});
it("preserves existing category IDs, service prices and profile details and requires speciality confirmation", async () => {
  expect(
    (
      await db.query(
        "SELECT id,price_pence,deposit_pence,description,category_id,speciality_id,publication_status,active FROM beauty.services WHERE id=$1",
        [service],
      )
    ).rows[0],
  ).toEqual({
    id: service,
    price_pence: 5000,
    deposit_pence: 1500,
    description: "Original description",
    category_id: category,
    speciality_id: null,
    publication_status: "published",
    active: true,
  });
  expect(
    (
      await db.query(
        "SELECT business_name,bio,taxonomy_confirmed_at FROM beauty.professional_profiles WHERE id=$1",
        [pro],
      )
    ).rows[0],
  ).toEqual({
    business_name: "Legacy Hair",
    bio: "Existing profile information is preserved",
    taxonomy_confirmed_at: null,
  });
});

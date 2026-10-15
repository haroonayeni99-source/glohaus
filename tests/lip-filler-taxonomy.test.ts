import { beforeAll, afterAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { migrationPlan } from "../scripts/migration-plan.mjs";
import { createTestDatabase } from "./test-database";
import { enrolAccount } from "@/modules/accounts/repository";
import {
  saveService,
  publicProfessionals,
} from "@/modules/professionals/repository";
import { taxonomyCatalog } from "@/modules/taxonomy/repository";
const db = await createTestDatabase();
let sql: string,
  legacy: string,
  pro: string,
  category: string,
  speciality: string,
  template: string;
beforeAll(async () => {
  const plan = await migrationPlan();
  const correction = plan.find(
    (m) => m.name === "20261015220113_correct_lip_filler_taxonomy.sql",
  )!;
  for (const m of plan.slice(0, plan.indexOf(correction)))
    await db.exec(await readFile(m.url, "utf8"));
  legacy = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.platform_categories(name,slug) VALUES('lip filler','lip-filler') RETURNING id",
    )
  ).rows[0].id;
  await db.query("WITH owner_account AS (INSERT INTO beauty.users(auth_id,email,display_name) VALUES('catalogue-owner','catalogue-owner@example.test','Fixture Owner') RETURNING id) INSERT INTO beauty.user_roles(user_id,role) SELECT id,'owner' FROM owner_account");
  sql = await readFile(correction.url, "utf8");
  await db.exec(sql);
  const catalog = await taxonomyCatalog(db);
  category = catalog.categories.find((c) => c.slug === "aesthetics")!.id;
  speciality = catalog.specialities.find((s) => s.slug === "injectables")!.id;
  template = catalog.templates.find((t) => t.slug === "lip-filler")!.id;
  pro = (
    await db.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE beauty_app");
      await tx.query(
        "SELECT set_config('app.auth_id','filler-professional',true)",
      );
      return enrolAccount(
        tx,
        {
          authId: "filler-professional",
          email: "filler@example.test",
          displayName: "Filler Fixture",
          secondFactorAge: null,
        },
        "professional",
      );
    })
  ).professionalId!;
  await db.query(
    "UPDATE beauty.professional_profiles SET business_name='Filler Fixture',slug='filler-fixture',bio='Fictional aesthetic services for testing',city='London',publication_status='published' WHERE id=$1",
    [pro],
  );
  await db.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE beauty_app");
    await tx.query(
      "SELECT set_config('app.auth_id','filler-professional',true)",
    );
    await tx.query("SELECT beauty.save_my_specialities($1,$2,$3)", [
      [category],
      [speciality],
      speciality,
    ]);
    await saveService(tx, pro, {
      name: "Lip Enhancement",
      description: "Fictional consultation-led aesthetic service",
      durationMinutes: 30,
      pricePence: 15000,
      depositPence: 4500,
      active: true,
      publicationStatus: "published",
      categoryId: category,
      specialityId: speciality,
      templateId: template,
    });
  });
});
afterAll(() => db.close());
it("retains the legacy category for history while offering the treatment under Aesthetics / Injectables", async () => {
  const catalog = await taxonomyCatalog(db);
  expect(catalog.categories.some((c) => c.id === legacy)).toBe(false);
  expect(catalog.templates.find((t) => t.id === template)?.speciality_id).toBe(
    speciality,
  );
  expect(
    catalog.specialities.find((s) => s.id === speciality)?.category_id,
  ).toBe(category);
  expect(
    (
      await db.query(
        "SELECT active,legacy_only,canonical_category_id FROM beauty.platform_categories WHERE id=$1",
        [legacy],
      )
    ).rows[0],
  ).toEqual({
    active: false,
    legacy_only: true,
    canonical_category_id: category,
  });
  expect(
    (
      await db.query(
        "SELECT * FROM beauty.admin_audit_logs WHERE action='taxonomy.treatment.reclassified'",
      )
    ).rows,
  ).toHaveLength(1);
});
it("finds published service-specific results through precise aliases and excludes unrelated services", async () => {
  for (const term of [
    "lip filler",
    "lip fillers",
    "lipfiller",
    "lip augmentation",
  ])
    expect((await publicProfessionals(db, term)).map((p) => p.id)).toEqual([
      pro,
    ]);
  expect(await publicProfessionals(db, "Knotless Braids")).toHaveLength(0);
});
it("fails closed if a legacy category acquires references, without modifying them or publication state", async () => {
  await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE beauty.platform_categories SET active=true,legacy_only=false WHERE id=$1",
      [legacy],
    );
    await tx.query(
      "INSERT INTO beauty.professional_categories(professional_id,category_id) VALUES($1,$2)",
      [pro, legacy],
    );
    await tx.query("SAVEPOINT correction");
    await expect(tx.query(sql)).rejects.toThrow(
      "LEGACY_LIP_FILLER_REFERENCES_REQUIRE_REVIEW",
    );
    await tx.query("ROLLBACK TO SAVEPOINT correction");
    expect(
      (
        await tx.query<{ active: boolean }>(
          "SELECT active FROM beauty.platform_categories WHERE id=$1",
          [legacy],
        )
      ).rows[0].active,
    ).toBe(true);
    expect(
      (
        await tx.query(
          "SELECT id FROM beauty.services WHERE professional_id=$1 AND active",
          [pro],
        )
      ).rows,
    ).toHaveLength(1);
  });
});

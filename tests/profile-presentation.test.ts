import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";

const db = new PGlite();
let professionalId: string;

async function asUser<T>(
  authId: string,
  work: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const professional = await asUser("presentation-pro", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "presentation-pro",
        email: "presentation-pro@example.test",
        displayName: "Presentation Pro",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = professional.professionalId!;

  await asUser("presentation-pro", (sql) =>
    sql.query(
      `UPDATE beauty.professional_profiles
       SET slug='presentation-pro',business_name='Presentation Pro',
           bio='A published professional profile used for presentation testing.',
           city='London',publication_status='published'
       WHERE id=$1`,
      [professionalId],
    ),
  );
});

afterAll(() => db.close());

describe.sequential("paid professional profile presentation", () => {
  it("keeps Starter on the standard presentation", async () => {
    await expect(
      asUser("presentation-pro", (sql) =>
        sql.query(
          `INSERT INTO beauty.professional_profile_presentation(
             professional_id,profile_style,portfolio_layout,service_style
           ) VALUES($1,'editorial','feature','clean')`,
          [professionalId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("allows an active paid professional to save public-safe presentation settings", async () => {
    await db.query(
      `INSERT INTO beauty.professional_subscriptions(
         professional_id,plan_key,status,provider_customer_id,
         provider_subscription_id,provider_price_id,accepted_terms_version,accepted_at
       ) VALUES($1,'pro','active','cus_presentation','sub_presentation',
         'price_pro','professional-pricing-v1',now())`,
      [professionalId],
    );

    await asUser("presentation-pro", (sql) =>
      sql.query(
        `INSERT INTO beauty.professional_profile_presentation(
           professional_id,profile_style,portfolio_layout,service_style
         ) VALUES($1,'editorial','feature','clean')`,
        [professionalId],
      ),
    );

    const publicRead = await asUser("", (sql) =>
      sql.query<{
        profile_style: string;
        portfolio_layout: string;
        service_style: string;
      }>(
        `SELECT profile_style,portfolio_layout,service_style
         FROM beauty.professional_profile_presentation
         WHERE professional_id=$1`,
        [professionalId],
      ),
    );

    expect(publicRead.rows[0]).toEqual({
      profile_style: "editorial",
      portfolio_layout: "feature",
      service_style: "clean",
    });
  });

  it("removes paid presentation settings when the subscription is no longer active", async () => {
    await db.query(
      `UPDATE beauty.professional_subscriptions
       SET status='cancelled'
       WHERE professional_id=$1`,
      [professionalId],
    );

    const publicRead = await asUser("", (sql) =>
      sql.query(
        "SELECT professional_id FROM beauty.professional_profile_presentation WHERE professional_id=$1",
        [professionalId],
      ),
    );

    expect(publicRead.rows).toEqual([]);
  });
});

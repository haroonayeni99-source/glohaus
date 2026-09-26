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

async function asPaymentWorker<T>(
  work: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const account = await asUser("plan-pro", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "plan-pro",
        email: "plan-pro@example.test",
        displayName: "Plan Professional",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = account.professionalId!;
});

afterAll(() => db.close());

async function pricing() {
  return (
    await asUser("plan-pro", (sql) =>
      sql.query<{
        data: {
          planKey: string;
          serviceCommissionBasisPoints: number;
          monthlyPricePence: number;
        };
      }>("SELECT beauty.my_professional_pricing() AS data"),
    )
  ).rows[0].data;
}

describe.sequential("professional subscription billing state", () => {
  it("starts on Starter and prevents direct subscription mutation", async () => {
    expect(await pricing()).toMatchObject({
      planKey: "starter",
      serviceCommissionBasisPoints: 800,
      monthlyPricePence: 0,
    });

    await expect(
      asUser("plan-pro", (sql) =>
        sql.query(
          `INSERT INTO beauty.professional_subscriptions(
             professional_id,plan_key,status
           ) VALUES($1,'premium','active')`,
          [professionalId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("activates Pro only through the payment worker", async () => {
    await asPaymentWorker((sql) =>
      sql.query(
        "SELECT beauty.apply_professional_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          professionalId,
          "pro",
          "cus_plan_test",
          "sub_plan_test",
          "price_pro_test",
          "active",
          null,
          false,
          "professional-pricing-v1",
        ],
      ),
    );

    expect(await pricing()).toMatchObject({
      planKey: "pro",
      serviceCommissionBasisPoints: 600,
      monthlyPricePence: 1999,
    });
  });

  it("falls back to Starter commission when billing is past due", async () => {
    await asPaymentWorker((sql) =>
      sql.query(
        "SELECT beauty.apply_professional_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          professionalId,
          "pro",
          "cus_plan_test",
          "sub_plan_test",
          "price_pro_test",
          "past_due",
          null,
          false,
          "professional-pricing-v1",
        ],
      ),
    );

    expect(await pricing()).toMatchObject({
      planKey: "starter",
      serviceCommissionBasisPoints: 800,
      monthlyPricePence: 0,
    });
  });

  it("supports a verified move to Premium and cancellation back to Starter", async () => {
    await asPaymentWorker((sql) =>
      sql.query(
        "SELECT beauty.apply_professional_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          professionalId,
          "premium",
          "cus_plan_test",
          "sub_plan_test",
          "price_premium_test",
          "active",
          null,
          false,
          "professional-pricing-v1",
        ],
      ),
    );

    expect(await pricing()).toMatchObject({
      planKey: "premium",
      serviceCommissionBasisPoints: 400,
      monthlyPricePence: 3999,
    });

    await asPaymentWorker((sql) =>
      sql.query(
        "SELECT beauty.apply_professional_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          professionalId,
          "premium",
          "cus_plan_test",
          "sub_plan_test",
          "price_premium_test",
          "cancelled",
          null,
          false,
          "professional-pricing-v1",
        ],
      ),
    );

    expect(await pricing()).toMatchObject({
      planKey: "starter",
      serviceCommissionBasisPoints: 800,
      monthlyPricePence: 0,
    });
  });
});

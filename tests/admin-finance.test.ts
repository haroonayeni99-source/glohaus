import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";

const db = new PGlite();
let professionalId: string;
let customerId: string;

async function asUser<T>(
  authId: string,
  verified: boolean,
  work: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    if (verified)
      await tx.query("SELECT set_config('app.admin_verified','true',true)");
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const professional = await asUser("finance-admin-pro", false, (sql) =>
    enrolAccount(sql, {
      authId: "finance-admin-pro",
      email: "finance-admin-pro@example.test",
      displayName: "Finance Professional",
      secondFactorAge: null,
    }, "professional"),
  );
  professionalId = professional.professionalId!;
  customerId = (
    await asUser("finance-admin-customer", false, (sql) =>
      enrolAccount(sql, {
        authId: "finance-admin-customer",
        email: "finance-admin-customer@example.test",
        displayName: "Finance Customer",
        secondFactorAge: null,
      }, "customer"),
    )
  ).id;

  const admin = await asUser("finance-admin", false, (sql) =>
    enrolAccount(sql, {
      authId: "finance-admin",
      email: "finance-admin@example.test",
      displayName: "Finance Admin",
      secondFactorAge: null,
    }, "customer"),
  );
  await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')", [admin.id]);
  await db.query("UPDATE beauty.professional_profiles SET business_name='Finance Studio' WHERE id=$1", [professionalId]);

  await db.query("SELECT beauty.ensure_financial_accounts($1)", [professionalId]);
  await db.query(
    `SELECT beauty.record_financial_ledger(
      'admin-finance-fixture','payment','booking',NULL,$1,'{}'::jsonb,
      '[{"accountCode":"provider_clearing","amountPence":5000},{"accountCode":"platform_fee_revenue","amountPence":-1000},{"accountCode":"professional_pending","amountPence":-4000}]'::jsonb
    )`,
    [professionalId],
  );

  await db.query(
    `INSERT INTO beauty.professional_subscriptions(
      professional_id,plan_key,status,provider_customer_id,
      provider_subscription_id,provider_price_id,accepted_terms_version,accepted_at
    ) VALUES($1,'pro','active','cus_admin_finance','sub_admin_finance',
      'price_admin_finance','professional-pricing-v1',now())`,
    [professionalId],
  );

  const serviceId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.services(
        professional_id,name,description,duration_minutes,price_pence,deposit_pence,active
      ) VALUES($1,'Finance test','',60,5000,0,true) RETURNING id`,
      [professionalId],
    )
  ).rows[0].id;
  const bookingId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.bookings(
        professional_id,customer_id,service_id,service_name,customer_name,
        professional_name,starts_at,ends_at,duration_minutes,price_pence,
        deposit_pence,status,hold_expires_at
      ) VALUES($1,$2,$3,'Finance test','Finance Customer','Finance Studio',
        now()-interval '2 days',now()-interval '2 days'+interval '1 hour',
        60,5000,0,'completed',now()-interval '3 days') RETURNING id`,
      [professionalId, customerId, serviceId],
    )
  ).rows[0].id;
  await db.query(
    `INSERT INTO beauty.payments(booking_id,captured_pence,refunded_pence,status)
     VALUES($1,5100,1000,'paid')`,
    [bookingId],
  );
  await db.query(
    `INSERT INTO beauty.financial_payouts(
      professional_id,kind,requested_pence,withdrawal_fee_pence,
      bank_amount_pence,status
    ) VALUES($1,'instant',1000,40,960,'paid')`,
    [professionalId],
  );
});

afterAll(() => db.close());

describe("verified admin finance overview", () => {
  it("rejects non-admin and unverified admin reads", async () => {
    await expect(
      asUser("finance-admin-customer", true, (sql) =>
        sql.query("SELECT beauty.admin_finance_overview()"),
      ),
    ).rejects.toThrow("FORBIDDEN");

    await expect(
      asUser("finance-admin", false, (sql) =>
        sql.query("SELECT beauty.admin_finance_overview()"),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("returns read-only revenue, liabilities, subscriptions and payouts", async () => {
    const result = await asUser("finance-admin", true, (sql) =>
      sql.query<{
        data: {
          metrics: {
            platformRevenuePence: number;
            bookingCapturedPence: number;
            bookingRefundedPence: number;
            activePaidSubscriptions: number;
            activeSubscriptionMrrPence: number;
            professionalPendingPence: number;
            payoutPaidPence: number;
          };
          payoutCounts: { paid: number };
          recentPayouts: { business_name: string; status: string }[];
        };
      }>("SELECT beauty.admin_finance_overview() AS data"),
    );

    expect(result.rows[0].data.metrics).toMatchObject({
      platformRevenuePence: 1000,
      bookingCapturedPence: 5100,
      bookingRefundedPence: 1000,
      activePaidSubscriptions: 1,
      activeSubscriptionMrrPence: 1999,
      professionalPendingPence: 4000,
      payoutPaidPence: 960,
    });
    expect(result.rows[0].data.payoutCounts.paid).toBe(1);
    expect(result.rows[0].data.recentPayouts[0]).toMatchObject({
      business_name: "Finance Studio",
      status: "paid",
    });
  });
});

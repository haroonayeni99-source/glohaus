import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveSchedule } from "@/modules/availability/repository";
import { saveService, updateProfile } from "@/modules/professionals/repository";

const db = new PGlite();
let professionalId: string;
let serviceId: string;
let bookingId: string;

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

  const professional = await asUser("finance-pro", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "finance-pro",
        email: "finance-pro@example.test",
        displayName: "Finance Studio",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = professional.professionalId!;

  await asUser("finance-pro", async (sql) => {
    await updateProfile(sql, professionalId, {
      slug: "finance-studio",
      businessName: "Finance Studio",
      bio: "Protected booking finance test profile.",
      city: "London",
      category: "Nails",
      publicationStatus: "published",
    });
    serviceId = (
      await saveService(sql, professionalId, {
        name: "Finance manicure",
        description: "",
        durationMinutes: 60,
        pricePence: 5000,
        depositPence: 2000,
        active: true,
      })
    ).id as string;
    await saveSchedule(
      sql,
      professionalId,
      Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startMinute: 480,
        endMinute: 1200,
      })),
    );
    await sql.query(
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_booking_finance')",
      [professionalId],
    );
  });

  await asPaymentWorker((sql) =>
    sql.query("SELECT beauty.sync_connect_account('acct_booking_finance',true)"),
  );

  const customer = await asUser("finance-customer", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "finance-customer",
        email: "finance-customer@example.test",
        displayName: "Finance Customer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  expect(customer.id).toBeTruthy();

  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCHours(12, 0, 0, 0);
  bookingId = (
    await asUser("finance-customer", (sql) =>
      sql.query<{ data: { id: string } }>(
        "SELECT beauty.reserve_booking($1,$2) AS data",
        [serviceId, start.toISOString()],
      ),
    )
  ).rows[0].data.id;
});

afterAll(() => db.close());

describe.sequential("protected booking deposit finance", () => {
  it("uses Starter pricing and adds the £1 customer booking fee separately", async () => {
    const pricing = (
      await asUser("finance-pro", (sql) =>
        sql.query<{
          data: {
            planKey: string;
            monthlyPricePence: number;
            serviceCommissionBasisPoints: number;
            productCommissionBasisPoints: number;
            instantWithdrawalBasisPoints: number;
          };
        }>("SELECT beauty.my_professional_pricing() AS data"),
      )
    ).rows[0].data;
    expect(pricing).toMatchObject({
      planKey: "starter",
      monthlyPricePence: 0,
      serviceCommissionBasisPoints: 800,
      productCommissionBasisPoints: 1000,
      instantWithdrawalBasisPoints: 400,
    });
    const quote = (
      await asUser("finance-customer", (sql) =>
        sql.query<{
          data: {
            customerTotalPence: number;
            professionalProceedsPence: number;
            professionalPlatformFeePence: number;
          };
        }>(
          "SELECT beauty.prepare_booking_financial_quote($1) AS data",
          [bookingId],
        ),
      )
    ).rows[0].data;

    expect(quote).toEqual(
      expect.objectContaining({
        customerTotalPence: 2100,
        professionalPlatformFeePence: 400,
        professionalProceedsPence: 1600,
      }),
    );
  });

  it("records verified paid deposit as pending professional proceeds", async () => {
    await asUser("finance-customer", (sql) =>
      sql.query("SELECT beauty.attach_checkout($1,'cs_booking_finance')", [
        bookingId,
      ]),
    );

    await asPaymentWorker(async (sql) => {
      await sql.query(
        "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)",
        [
          "evt_booking_finance",
          bookingId,
          "cs_booking_finance",
          "pi_booking_finance",
          2100,
          "gbp",
        ],
      );
      await sql.query("SELECT beauty.record_booking_payment_finance($1,$2)", [
        bookingId,
        "pi_booking_finance",
      ]);
    });

    const wallet = (
      await asUser("finance-pro", (sql) =>
        sql.query<{ data: { pendingPence: number; availablePence: number } }>(
          "SELECT beauty.my_wallet_overview() AS data",
        ),
      )
    ).rows[0].data;
    expect(wallet.pendingPence).toBe(1600);
    expect(wallet.availablePence).toBe(0);
  });

  it("does not release before the completed-service protection window", async () => {
    await db.query(
      "UPDATE beauty.bookings SET status='completed',completed_at=now() WHERE id=$1",
      [bookingId],
    );

    const released = (
      await asUser("finance-pro", (sql) =>
        sql.query<{ released: number }>(
          "SELECT beauty.release_my_mature_booking_proceeds() AS released",
        ),
      )
    ).rows[0].released;
    expect(released).toBe(0);
  });

  it("releases after 24 hours and protects standard and instant withdrawals", async () => {
    await db.query(
      "UPDATE beauty.bookings SET completed_at=now()-interval '25 hours' WHERE id=$1",
      [bookingId],
    );

    const released = (
      await asUser("finance-pro", (sql) =>
        sql.query<{ released: number }>(
          "SELECT beauty.release_my_mature_booking_proceeds() AS released",
        ),
      )
    ).rows[0].released;
    expect(released).toBe(1);

    const available = (
      await asUser("finance-pro", (sql) =>
        sql.query<{ data: { availablePence: number } }>(
          "SELECT beauty.my_wallet_overview() AS data",
        ),
      )
    ).rows[0].data.availablePence;
    expect(available).toBe(1600);

    const standard = (
      await asUser("finance-pro", (sql) =>
        sql.query<{
          data: {
            id: string;
            requestedPence: number;
            withdrawalFeePence: number;
            bankAmountPence: number;
          };
        }>("SELECT beauty.request_my_payout('standard',1000) AS data"),
      )
    ).rows[0].data;
    expect(standard).toMatchObject({
      requestedPence: 1000,
      withdrawalFeePence: 0,
      bankAmountPence: 1000,
    });

    let wallet = (
      await asUser("finance-pro", (sql) =>
        sql.query<{ data: { availablePence: number; processingPence: number } }>(
          "SELECT beauty.my_wallet_overview() AS data",
        ),
      )
    ).rows[0].data;
    expect(wallet).toMatchObject({
      availablePence: 600,
      processingPence: 1000,
    });

    await asPaymentWorker((sql) =>
      sql.query("SELECT beauty.cancel_requested_payout($1)", [standard.id]),
    );

    const instant = (
      await asUser("finance-pro", (sql) =>
        sql.query<{
          data: {
            id: string;
            requestedPence: number;
            withdrawalFeePence: number;
            bankAmountPence: number;
          };
        }>("SELECT beauty.request_my_payout('instant',1000) AS data"),
      )
    ).rows[0].data;
    expect(instant).toMatchObject({
      requestedPence: 1000,
      withdrawalFeePence: 40,
      bankAmountPence: 960,
    });

    wallet = (
      await asUser("finance-pro", (sql) =>
        sql.query<{ data: { availablePence: number; processingPence: number } }>(
          "SELECT beauty.my_wallet_overview() AS data",
        ),
      )
    ).rows[0].data;
    expect(wallet).toMatchObject({
      availablePence: 600,
      processingPence: 960,
    });

    await asPaymentWorker((sql) =>
      sql.query("SELECT beauty.cancel_requested_payout($1)", [instant.id]),
    );

    await expect(
      asUser("finance-pro", (sql) =>
        sql.query("SELECT beauty.request_my_payout('standard',2000)"),
      ),
    ).rejects.toThrow();

    const finalStandard = (
      await asUser("finance-pro", (sql) =>
        sql.query<{ data: { id: string } }>(
          "SELECT beauty.request_my_payout('standard',1000) AS data",
        ),
      )
    ).rows[0].data;

    await asPaymentWorker(async (sql) => {
      await sql.query(
        "SELECT beauty.record_payout_provider($1,$2,$3,$4,$5,$6)",
        [
          finalStandard.id,
          "tr_standard_withdrawal",
          "po_standard_withdrawal",
          null,
          0,
          new Date(Date.now() + 3 * 86400000).toISOString(),
        ],
      );
      await sql.query(
        "SELECT beauty.apply_payout_result('po_standard_withdrawal','paid')",
      );
    });

    wallet = (
      await asUser("finance-pro", (sql) =>
        sql.query<{ data: { availablePence: number; processingPence: number } }>(
          "SELECT beauty.my_wallet_overview() AS data",
        ),
      )
    ).rows[0].data;
    expect(wallet).toMatchObject({
      availablePence: 600,
      processingPence: 0,
    });
  });
});

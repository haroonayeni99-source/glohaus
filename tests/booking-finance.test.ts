import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveSchedule } from "@/modules/availability/repository";
import { saveService, updateProfile } from "@/modules/professionals/repository";

const db = new PGlite();
let professionalId: string;
let customerId: string;
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
  customerId = customer.id;

  await db.query(
    `INSERT INTO beauty.financial_fee_rules(
      transaction_kind,category_key,fee_payer,percentage_basis_points,
      fixed_fee_pence,minimum_fee_pence,minimum_transaction_pence,
      processing_cost_payer,created_by_user_id
    ) VALUES('booking',NULL,'professional',1000,0,0,1,'platform',$1)`,
    [customerId],
  );

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
  it("snapshots professional commission without changing the customer deposit", async () => {
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
        customerTotalPence: 2000,
        professionalPlatformFeePence: 200,
        professionalProceedsPence: 1800,
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
          2000,
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
    expect(wallet.pendingPence).toBe(1800);
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

  it("releases after 24 hours and records the transfer only once", async () => {
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
    expect(available).toBe(1800);

    for (let attempt = 0; attempt < 2; attempt++)
      await asPaymentWorker((sql) =>
        sql.query("SELECT beauty.record_booking_transfer($1,$2,$3)", [
          bookingId,
          "tr_booking_finance",
          1800,
        ]),
      );

    const payment = (
      await db.query<{ stripe_transfer_id: string }>(
        "SELECT stripe_transfer_id FROM beauty.payments WHERE booking_id=$1",
        [bookingId],
      )
    ).rows[0];
    expect(payment.stripe_transfer_id).toBe("tr_booking_finance");

    const after = (
      await asUser("finance-pro", (sql) =>
        sql.query<{ data: { availablePence: number } }>(
          "SELECT beauty.my_wallet_overview() AS data",
        ),
      )
    ).rows[0].data.availablePence;
    expect(after).toBe(0);
  });
});

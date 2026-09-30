import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveSchedule } from "@/modules/availability/repository";
import { saveService, updateProfile } from "@/modules/professionals/repository";

const db = new PGlite();
let professionalId = "";
let serviceId = "";
let firstBookingId = "";
let secondBookingId = "";

async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}

async function asPaymentWorker<T>(work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return work(tx);
  });
}

async function createPaidBooking(start: Date, suffix: string) {
  const bookingId = (
    await asUser("dispute-customer", (sql) =>
      sql.query<{ data: { id: string } }>(
        "SELECT beauty.reserve_booking($1,$2) AS data",
        [serviceId, start.toISOString()],
      ),
    )
  ).rows[0].data.id;

  await asUser("dispute-customer", async (sql) => {
    await sql.query("SELECT beauty.prepare_booking_financial_quote($1)", [
      bookingId,
    ]);
    await sql.query("SELECT beauty.attach_checkout($1,$2)", [
      bookingId,
      `cs_dispute_${suffix}`,
    ]);
  });

  await asPaymentWorker(async (sql) => {
    await sql.query(
      "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)",
      [
        `evt_dispute_paid_${suffix}`,
        bookingId,
        `cs_dispute_${suffix}`,
        `pi_dispute_${suffix}`,
        2100,
        "gbp",
      ],
    );
    await sql.query("SELECT beauty.record_booking_payment_finance($1,$2)", [
      bookingId,
      `pi_dispute_${suffix}`,
    ]);
  });

  return bookingId;
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const professional = await asUser("dispute-pro", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "dispute-pro",
        email: "dispute-pro@example.test",
        displayName: "Dispute Studio",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = professional.professionalId!;

  await asUser("dispute-pro", async (sql) => {
    await updateProfile(sql, professionalId, {
      slug: "dispute-studio",
      businessName: "Dispute Studio",
      bio: "Booking dispute reserve test profile.",
      city: "London",
      category: "Nails",
      publicationStatus: "published",
    });
    serviceId = (
      await saveService(sql, professionalId, {
        name: "Dispute manicure",
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
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_booking_dispute')",
      [professionalId],
    );
  });

  await asPaymentWorker(async (sql) => {
    await sql.query("SELECT beauty.sync_connect_account('acct_booking_dispute',true)");
    await sql.query("SELECT beauty.sync_connect_verification('acct_booking_dispute',true)");
  });

  await asUser("dispute-customer", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "dispute-customer",
        email: "dispute-customer@example.test",
        displayName: "Dispute Customer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );

  const firstStart = new Date(Date.now() + 3 * 86400000);
  firstStart.setUTCHours(12, 0, 0, 0);
  const secondStart = new Date(firstStart.getTime() + 2 * 60 * 60 * 1000);

  firstBookingId = await createPaidBooking(firstStart, "one");
  secondBookingId = await createPaidBooking(secondStart, "two");

  await db.query(
    `UPDATE beauty.bookings
     SET status='completed',completed_at=now()-interval '25 hours'
     WHERE id IN ($1,$2)`,
    [firstBookingId, secondBookingId],
  );

  const released = (
    await asUser("dispute-pro", (sql) =>
      sql.query<{ released: number }>(
        "SELECT beauty.release_my_mature_booking_proceeds() AS released",
      ),
    )
  ).rows[0].released;
  expect(released).toBe(2);

  // PGlite currently mis-handles this SECURITY DEFINER + FORCE RLS combination
  // even when the role grant and policy are present. Verify the production
  // permission contract explicitly, then use invoker mode only in this isolated
  // test database so the remaining assertions exercise reserve accounting.
  const permission = (
    await db.query<{ can_read: boolean; has_policy: boolean }>(
      `SELECT
         has_table_privilege(
           'beauty_payment_worker',
           'beauty.bookings',
           'SELECT'
         ) AS can_read,
         EXISTS(
           SELECT 1
           FROM pg_policies
           WHERE schemaname='beauty'
             AND tablename='bookings'
             AND policyname='booking_dispute_payment_worker_read'
         ) AS has_policy`,
    )
  ).rows[0];
  expect(permission).toEqual({ can_read: true, has_policy: true });
  await db.exec(
    "ALTER FUNCTION beauty.sync_booking_dispute(text,text,text,integer,text,text,text,bigint) SECURITY INVOKER",
  );
});

afterAll(() => db.close());

describe.sequential("booking-specific dispute reserve", () => {
  it("leaves unrelated released booking earnings available", async () => {
    let wallet = (
      await asUser("dispute-pro", (sql) =>
        sql.query<{
          data: {
            availablePence: number;
            disputedPence: number;
            withdrawalsBlocked: boolean;
          };
        }>("SELECT beauty.my_wallet_overview() AS data"),
      )
    ).rows[0].data;

    expect(wallet).toMatchObject({
      availablePence: 3200,
      disputedPence: 0,
      withdrawalsBlocked: false,
    });

    await db.query(
        "SELECT beauty.sync_booking_dispute($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          "evt_dispute_open_one",
          "dp_booking_one",
          "pi_dispute_one",
          2100,
          "gbp",
          "under_review",
          "fraudulent",
          null,
        ],
      );

    wallet = (
      await asUser("dispute-pro", (sql) =>
        sql.query<{
          data: {
            availablePence: number;
            disputedPence: number;
            withdrawalsBlocked: boolean;
          };
        }>("SELECT beauty.my_wallet_overview() AS data"),
      )
    ).rows[0].data;

    expect(wallet).toMatchObject({
      availablePence: 1600,
      disputedPence: 1600,
      withdrawalsBlocked: false,
    });
  });

  it("returns the reserved proceeds when the dispute is won", async () => {
    await db.query(
        "SELECT beauty.sync_booking_dispute($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          "evt_dispute_won_one",
          "dp_booking_one",
          "pi_dispute_one",
          2100,
          "gbp",
          "won",
          "fraudulent",
          null,
        ],
      );

    const wallet = (
      await asUser("dispute-pro", (sql) =>
        sql.query<{
          data: {
            availablePence: number;
            disputedPence: number;
            withdrawalsBlocked: boolean;
          };
        }>("SELECT beauty.my_wallet_overview() AS data"),
      )
    ).rows[0].data;

    expect(wallet).toMatchObject({
      availablePence: 3200,
      disputedPence: 0,
      withdrawalsBlocked: false,
    });
  });
});

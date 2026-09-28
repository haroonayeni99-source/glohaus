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
let decisionId: string;

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

  const professional = await asUser("refund-pro", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "refund-pro",
        email: "refund-pro@example.test",
        displayName: "Refund Studio",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = professional.professionalId!;

  await asUser("refund-pro", async (sql) => {
    await updateProfile(sql, professionalId, {
      slug: "refund-studio",
      businessName: "Refund Studio",
      bio: "Refund finance test profile.",
      city: "London",
      category: "Hair",
      publicationStatus: "published",
    });
    serviceId = (
      await saveService(sql, professionalId, {
        name: "Refund service",
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
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_refund_test')",
      [professionalId],
    );
  });

  await asPaymentWorker(async (sql) => {
    await sql.query("SELECT beauty.sync_connect_account('acct_refund_test',true)");
    await sql.query("SELECT beauty.sync_connect_verification('acct_refund_test',true)");
  });

  await asUser("refund-customer", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "refund-customer",
        email: "refund-customer@example.test",
        displayName: "Refund Customer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );

  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCHours(12, 0, 0, 0);
  bookingId = (
    await asUser("refund-customer", (sql) =>
      sql.query<{ data: { id: string } }>(
        "SELECT beauty.reserve_booking($1,$2) AS data",
        [serviceId, start.toISOString()],
      ),
    )
  ).rows[0].data.id;

  await asUser("refund-customer", async (sql) => {
    await sql.query("SELECT beauty.prepare_booking_financial_quote($1)", [
      bookingId,
    ]);
    await sql.query("SELECT beauty.attach_checkout($1,'cs_refund_test')", [
      bookingId,
    ]);
  });

  await asPaymentWorker(async (sql) => {
    await sql.query(
      "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)",
      [
        "evt_refund_payment",
        bookingId,
        "cs_refund_test",
        "pi_refund_test",
        2100,
        "gbp",
      ],
    );
    await sql.query("SELECT beauty.record_booking_payment_finance($1,$2)", [
      bookingId,
      "pi_refund_test",
    ]);
  });

  await db.query(
    `UPDATE beauty.bookings
     SET status='cancelled',cancellation_actor='professional',
         cancelled_at=now(),cancellation_reason='Professional unavailable'
     WHERE id=$1`,
    [bookingId],
  );

  decisionId = (
    await asUser("refund-pro", (sql) =>
      sql.query<{ data: { id: string; amountPence: number } }>(
        "SELECT beauty.decide_refund($1,true,100,$2) AS data",
        [bookingId, "Professional could not fulfil the service"],
      ),
    )
  ).rows[0].data.id;
});

afterAll(() => db.close());

describe.sequential("booking refund financial protection", () => {
  it("recovers the professional share and preserves GLOHAUS fees", async () => {
    await asPaymentWorker(async (sql) => {
      await sql.query("SELECT beauty.apply_refund_result($1,$2,$3,$4,$5)", [
        decisionId,
        "re_refund_test",
        2100,
        "succeeded",
        "pi_refund_test",
      ]);
      await sql.query("SELECT beauty.record_booking_refund_finance($1)", [
        decisionId,
      ]);
      await sql.query("SELECT beauty.record_booking_refund_finance($1)", [
        decisionId,
      ]);
    });

    const wallet = (
      await asUser("refund-pro", (sql) =>
        sql.query<{
          data: {
            pendingPence: number;
            availablePence: number;
            outstandingObligationPence: number;
          };
        }>("SELECT beauty.my_wallet_overview() AS data"),
      )
    ).rows[0].data;

    expect(wallet).toMatchObject({
      pendingPence: 0,
      availablePence: 0,
      outstandingObligationPence: 500,
    });

    const transaction = (
      await db.query<{ metadata: Record<string, unknown> }>(
        "SELECT metadata FROM beauty.financial_ledger_transactions WHERE event_reference=$1",
        [`booking-refund:${decisionId}`],
      )
    ).rows[0];
    expect(transaction.metadata).toMatchObject({
      customerRefundPence: 2100,
      professionalRecoveredPence: 1600,
      professionalObligationPence: 500,
      platformFeesPreserved: true,
    });
  });


  it("uses future available earnings to clear the obligation first", async () => {
    await asPaymentWorker((sql) =>
      sql.query(
        "SELECT beauty.record_financial_ledger($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)",
        [
          "future-earnings-refund-test",
          "release",
          "admin",
          null,
          professionalId,
          JSON.stringify({ test: true }),
          JSON.stringify([
            { accountCode: "provider_clearing", amountPence: 600 },
            { accountCode: "professional_available", amountPence: -600 },
          ]),
        ],
      ),
    );

    const recovered = (
      await asUser("refund-pro", (sql) =>
        sql.query<{ recovered: number }>(
          "SELECT beauty.recover_my_outstanding_obligation() AS recovered",
        ),
      )
    ).rows[0].recovered;
    expect(recovered).toBe(500);

    const wallet = (
      await asUser("refund-pro", (sql) =>
        sql.query<{
          data: {
            availablePence: number;
            outstandingObligationPence: number;
          };
        }>("SELECT beauty.my_wallet_overview() AS data"),
      )
    ).rows[0].data;

    expect(wallet).toMatchObject({
      availablePence: 100,
      outstandingObligationPence: 0,
    });
  });

  // Stripe commonly emits both refund.created and refund.updated for one refund.
  it("reconciles a Stripe Dashboard refund exactly once", async () => {
    const start = new Date(Date.now() + 5 * 86400000);
    start.setUTCHours(15, 0, 0, 0);

    const externalBookingId = (
      await asUser("refund-customer", (sql) =>
        sql.query<{ data: { id: string } }>(
          "SELECT beauty.reserve_booking($1,$2) AS data",
          [serviceId, start.toISOString()],
        ),
      )
    ).rows[0].data.id;

    await asUser("refund-customer", async (sql) => {
      await sql.query("SELECT beauty.prepare_booking_financial_quote($1)", [
        externalBookingId,
      ]);
      await sql.query(
        "SELECT beauty.attach_checkout($1,'cs_external_refund_test')",
        [externalBookingId],
      );
    });

    await asPaymentWorker(async (sql) => {
      await sql.query(
        "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)",
        [
          "evt_external_refund_payment",
          externalBookingId,
          "cs_external_refund_test",
          "pi_external_refund_test",
          2100,
          "gbp",
        ],
      );
      await sql.query("SELECT beauty.record_booking_payment_finance($1,$2)", [
        externalBookingId,
        "pi_external_refund_test",
      ]);

      await sql.query(
        "SELECT beauty.reconcile_external_booking_refund($1,$2,$3,$4,$5)",
        [
          "evt_external_refund_created",
          "re_external_refund_test",
          2100,
          "succeeded",
          "pi_external_refund_test",
        ],
      );
      await sql.query(
        "SELECT beauty.reconcile_external_booking_refund($1,$2,$3,$4,$5)",
        [
          "evt_external_refund_updated",
          "re_external_refund_test",
          2100,
          "succeeded",
          "pi_external_refund_test",
        ],
      );
    });

    const payment = (
      await db.query<{ refunded_pence: number; status: string }>(
        "SELECT refunded_pence,status FROM beauty.payments WHERE booking_id=$1",
        [externalBookingId],
      )
    ).rows[0];
    expect(payment).toEqual({ refunded_pence: 2100, status: "refunded" });

    const providerRefunds = (
      await db.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM beauty.external_booking_refunds WHERE provider_ref='re_external_refund_test'",
      )
    ).rows[0].count;
    expect(providerRefunds).toBe(1);

    const ledgerRows = (
      await db.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM beauty.financial_ledger_transactions WHERE event_reference='booking-refund-external:re_external_refund_test'",
      )
    ).rows[0].count;
    expect(ledgerRows).toBe(1);
  });

});

import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile, saveService } from "@/modules/professionals/repository";
import { saveSchedule } from "@/modules/availability/repository";
import { professionalReviews } from "@/modules/reviews/repository";
import { checkoutReference } from "@/modules/bookings/repository";
import { customerPaymentOverview } from "@/modules/finance/repository";
const db = new PGlite();
let professional: string;
let service: string;
let booking: string;
let date: string;
let otherBooking: string;
async function asUser<T>(authId: string, fn: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return fn(tx);
  });
}
async function worker(fn: (sql: SqlClient) => Promise<unknown>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return fn(tx);
  });
}
beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  for (const authId of ["pro", "alice", "bob"]) {
    const account = await asUser(authId, (sql) =>
      enrolAccount(
        sql,
        {
          authId,
          email: `${authId}@example.test`,
          displayName: authId,
          secondFactorAge: null,
        },
        authId === "pro" ? "professional" : "customer",
      ),
    );
    if (authId === "pro") professional = account.professionalId!;
  }
  await asUser("pro", async (sql) => {
    await updateProfile(sql, professional, {
      slug: "the-studio",
      businessName: "The Studio",
      bio: "Independent beauty appointments in London.",
      city: "London",
      category: "Nails",
      publicationStatus: "published",
    });
    service = (
      await saveService(sql, professional, {
        name: "Manicure",
        description: "",
        durationMinutes: 60,
        pricePence: 4500,
        depositPence: 1500,
        active: true,
      })
    ).id as string;
    await saveSchedule(
      sql,
      professional,
      Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startMinute: 480,
        endMinute: 1200,
      })),
    );
    await sql.query(
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_test')",
      [professional],
    );
  });
  await worker((sql) =>
    sql.query("SELECT beauty.sync_connect_account('acct_test',true)"),
  );
  const tomorrow = new Date(Date.now() + 2 * 86400000);
  tomorrow.setUTCHours(12, 0, 0, 0);
  date = tomorrow.toISOString();
});
afterAll(() => db.close());
describe.sequential("booking transactions and verified deposits", () => {
  it("denies anonymous reservation", async () => {
    await expect(
      asUser("", (sql) =>
        sql.query("SELECT beauty.reserve_booking($1,$2)", [service, date]),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("rejects new bookings for an inactive service", async () => {
    await db.query("UPDATE beauty.services SET active=false WHERE id=$1", [
      service,
    ]);
    await expect(
      asUser("alice", (sql) =>
        sql.query("SELECT beauty.reserve_booking($1,$2)", [service, date]),
      ),
    ).rejects.toThrow("UNAVAILABLE_SERVICE");
    await db.query("UPDATE beauty.services SET active=true WHERE id=$1", [
      service,
    ]);
  });
  it("reserves with immutable service prices and no caller-supplied identity", async () => {
    const result = await asUser("alice", (sql) =>
      sql.query<{ data: { id: string; depositPence: number } }>(
        "SELECT beauty.reserve_booking($1,$2) AS data",
        [service, date],
      ),
    );
    booking = result.rows[0].data.id;
    expect(result.rows[0].data.depositPence).toBe(1500);
  });
  it("rejects an excessive deposit at the immutable booking boundary", async () => {
    const customerId = (
      await db.query<{ id: string }>(
        "SELECT id FROM beauty.users WHERE auth_id='bob'",
      )
    ).rows[0].id;
    await expect(
      db.query(
        "INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) VALUES($1,$2,$3,'Manicure','bob','The Studio',now()+interval '20 days',now()+interval '20 days 1 hour',60,4500,1801,'confirmed',now())",
        [professional, customerId, service],
      ),
    ).rejects.toThrow("MAXIMUM_DEPOSIT_EXCEEDED");
  });
  it("only the booking customer can retrieve its checkout reference", async () => {
    await asUser("alice", (sql) =>
      sql.query("SELECT beauty.attach_checkout($1,'cs_test')", [booking]),
    );
    expect(
      await asUser("alice", (sql) => checkoutReference(sql, booking)),
    ).toEqual({ bookingId: booking, sessionId: "cs_test", depositPence: 1500 });
    expect(
      await asUser("bob", (sql) => checkoutReference(sql, booking)),
    ).toBeUndefined();
    expect(
      await asUser("pro", (sql) => checkoutReference(sql, booking)),
    ).toBeUndefined();
    await db.query(
      "UPDATE beauty.bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1",
      [booking],
    );
    expect(
      await asUser("alice", (sql) => checkoutReference(sql, booking)),
    ).toBeUndefined();
    await db.query(
      "UPDATE beauty.bookings SET hold_expires_at=now()+interval '35 minutes' WHERE id=$1",
      [booking],
    );
  });
  it("retries return the same unexpired reservation", async () => {
    const result = await asUser("alice", (sql) =>
      sql.query<{ data: { id: string } }>(
        "SELECT beauty.reserve_booking($1,$2) AS data",
        [service, date],
      ),
    );
    expect(result.rows[0].data.id).toBe(booking);
  });
  it("rejects an overlapping appointment for another customer", async () => {
    await expect(
      asUser("bob", (sql) =>
        sql.query("SELECT beauty.reserve_booking($1,$2)", [service, date]),
      ),
    ).rejects.toThrow("SLOT_TAKEN");
  });
  it("does not expose private booking details to another customer", async () => {
    expect(
      (await asUser("bob", (sql) => sql.query("SELECT * FROM beauty.bookings")))
        .rows,
    ).toEqual([]);
    expect(
      (
        await asUser("pro", (sql) =>
          sql.query("SELECT customer_name FROM beauty.bookings"),
        )
      ).rows,
    ).toEqual([{ customer_name: "alice" }]);
  });
  it("returns busy times without identities to anonymous visitors", async () => {
    const result = await asUser("", (sql) =>
      sql.query("SELECT * FROM beauty.booking_busy($1,$2,$3)", [
        professional,
        date,
        new Date(Date.parse(date) + 86400000).toISOString(),
      ]),
    );
    expect(Object.keys(result.rows[0]).sort()).toEqual([
      "ends_at",
      "starts_at",
    ]);
  });
  it("cannot confirm payments using the customer database role", async () => {
    await expect(
      asUser("alice", (sql) =>
        sql.query(
          "SELECT beauty.apply_checkout_payment('evt_1',$1,'cs_test','pi_test',1600,'gbp')",
          [booking],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser("alice", (sql) =>
        sql.query("UPDATE beauty.bookings SET status='confirmed'"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("only the owner can attach a checkout", async () => {
    await expect(
      asUser("bob", (sql) =>
        sql.query("SELECT beauty.attach_checkout($1,'cs_test')", [booking]),
      ),
    ).rejects.toThrow("FORBIDDEN");
    await asUser("alice", (sql) =>
      sql.query("SELECT beauty.attach_checkout($1,'cs_test')", [booking]),
    );
  });
  it("prepares the immutable customer fee quote before payment capture", async () => {
    const quote = await asUser("alice", (sql) =>
      sql.query<{ data: { customerTotalPence: number; customerPlatformFeePence: number } }>(
        "SELECT beauty.prepare_booking_financial_quote($1) AS data",
        [booking],
      ),
    );
    expect(quote.rows[0].data).toMatchObject({
      customerTotalPence: 1600,
      customerPlatformFeePence: 100,
    });
  });
  it("rejects amount, currency and checkout mismatches", async () => {
    await expect(
      worker((sql) =>
        sql.query(
          "SELECT beauty.apply_checkout_payment('evt_bad',$1,'cs_test','pi_test',1499,'gbp')",
          [booking],
        ),
      ),
    ).rejects.toThrow("PAYMENT_MISMATCH");
    await expect(
      worker((sql) =>
        sql.query(
          "SELECT beauty.apply_checkout_payment('evt_bad',$1,'cs_other','pi_test',1600,'gbp')",
          [booking],
        ),
      ),
    ).rejects.toThrow("PAYMENT_MISMATCH");
  });
  it("confirms once and creates deduplicated notifications", async () => {
    for (let attempt = 0; attempt < 2; attempt++)
      await worker((sql) =>
        sql.query(
          "SELECT beauty.apply_checkout_payment('evt_paid',$1,'cs_test','pi_test',1600,'gbp')",
          [booking],
        ),
      );
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM beauty.bookings WHERE id=$1",
          [booking],
        )
      ).rows[0].status,
    ).toBe("confirmed");
    expect(
      (
        await db.query(
          "SELECT * FROM beauty.notification_outbox WHERE booking_id=$1",
          [booking],
        )
      ).rows,
    ).toHaveLength(3);
  });
  it("shows verified payment activity only to the booking customer", async () => {
    const aliceId = (
      await db.query<{ id: string }>(
        "SELECT id FROM beauty.users WHERE auth_id='alice'",
      )
    ).rows[0].id;

    const overview = await asUser("alice", (sql) =>
      customerPaymentOverview(sql, aliceId),
    );
    expect(overview).toMatchObject({
      capturedPence: 1600,
      refundedPence: 0,
      pendingRefundPence: 0,
    });
    expect(overview.records[0]).toMatchObject({
      bookingId: booking,
      serviceName: "Manicure",
      professionalName: "The Studio",
      capturedPence: 1600,
      refundedPence: 0,
      paymentStatus: "paid",
    });

    expect(
      (await asUser("bob", (sql) =>
        customerPaymentOverview(sql, aliceId),
      )).records,
    ).toEqual([]);
  });

  it("cannot complete an appointment before it ends", async () => {
    await expect(
      asUser("pro", (sql) =>
        sql.query("SELECT beauty.change_booking($1,'completed','')", [booking]),
      ),
    ).rejects.toThrow("INVALID_TRANSITION");
  });
  it("allows customer cancellation while preserving payment and policy snapshots", async () => {
    await asUser("alice", (sql) =>
      sql.query(
        "SELECT beauty.change_booking($1,'cancelled','Plans have changed')",
        [booking],
      ),
    );
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM beauty.payments WHERE booking_id=$1",
          [booking],
        )
      ).rows[0].status,
    ).toBe("refund_required");
  });
  it("releases the cancelled slot for another customer", async () => {
    const result = await asUser("bob", (sql) =>
      sql.query<{ data: { id: string } }>(
        "SELECT beauty.reserve_booking($1,$2) AS data",
        [service, date],
      ),
    );
    otherBooking = result.rows[0].data.id;
    expect(otherBooking).not.toBe(booking);
  });
  it("late payment requires a refund instead of reviving an expired booking", async () => {
    await asUser("bob", (sql) =>
      sql.query("SELECT beauty.attach_checkout($1,'cs_late')", [otherBooking]),
    );
    await asUser("bob", (sql) =>
      sql.query("SELECT beauty.prepare_booking_financial_quote($1)", [
        otherBooking,
      ]),
    );
    await db.query(
      "UPDATE beauty.bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1",
      [otherBooking],
    );
    await worker((sql) =>
      sql.query(
        "SELECT beauty.apply_checkout_payment('evt_late',$1,'cs_late','pi_late',1600,'gbp')",
        [otherBooking],
      ),
    );
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM beauty.payments WHERE booking_id=$1",
          [otherBooking],
        )
      ).rows[0].status,
    ).toBe("refund_required");
  });
});

describe.sequential("verified reviews", () => {
  it("rejects reviews for unfinished appointments", async () => {
    await expect(
      asUser("bob", (sql) =>
        sql.query(
          "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,5,'A really good appointment today','Bob')",
          [otherBooking],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("only the actual customer can review a completed appointment", async () => {
    await db.query(
      "UPDATE beauty.bookings SET status='completed',starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour',completed_at=now() WHERE id=$1",
      [booking],
    );
    await expect(
      asUser("bob", (sql) =>
        sql.query(
          "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,5,'A really good appointment today','Bob')",
          [booking],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await asUser("alice", (sql) =>
      sql.query(
        "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,5,'A really good appointment today','Alice')",
        [booking],
      ),
    );
  });
  it("scopes professional review lists and excludes hidden scores", async () => {
    const target = (
      await db.query<{ professional_id: string }>(
        "SELECT professional_id FROM beauty.bookings WHERE id=$1",
        [booking],
      )
    ).rows[0].professional_id;
    const own = await asUser("pro", (sql) => professionalReviews(sql, target));
    expect(own.reviews).toHaveLength(1);
    expect(own.totals).toEqual({ count: 1, average: 5 });
    expect(
      (await asUser("bob", (sql) => professionalReviews(sql, target))).reviews,
    ).toEqual([]);
    expect(
      (
        await asUser("pro", (sql) =>
          professionalReviews(sql, "00000000-0000-4000-8000-000000000000"),
        )
      ).reviews,
    ).toEqual([]);
    await db.query(
      "UPDATE beauty.reviews SET moderation_status='hidden' WHERE booking_id=$1",
      [booking],
    );
    const hidden = await asUser("pro", (sql) =>
      professionalReviews(sql, target),
    );
    expect(hidden.reviews[0].moderation_status).toBe("hidden");
    expect(hidden.totals).toEqual({ count: 0, average: null });
    await db.query(
      "UPDATE beauty.reviews SET moderation_status='visible' WHERE booking_id=$1",
      [booking],
    );
  });
  it("permits only one review per booking", async () => {
    await expect(
      asUser("alice", (sql) =>
        sql.query(
          "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,1,'Another review of the same booking','Alice')",
          [booking],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
  it("projects only public review fields and respects moderation", async () => {
    const rows = await asUser("", (sql) =>
      sql.query("SELECT * FROM beauty.public_reviews"),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).not.toHaveProperty("booking_id");
    await db.query("UPDATE beauty.reviews SET moderation_status='hidden'");
    expect(
      (
        await asUser("", (sql) =>
          sql.query("SELECT * FROM beauty.public_reviews"),
        )
      ).rows,
    ).toEqual([]);
  });
});

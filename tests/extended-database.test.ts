import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile, saveService } from "@/modules/professionals/repository";
import { addTimeOff, removeTimeOff } from "@/modules/availability/repository";
const db = new PGlite();
let professional: string;
let customer: string;
let service: string;
let booking: string;
let asset: string;
let decision: string;
async function asUser<T>(authId: string, fn: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return fn(tx);
  });
}
async function worker<T>(fn: (sql: SqlClient) => Promise<T>) {
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
  for (const authId of ["pro", "customer"]) {
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
    else customer = account.id;
  }
  await asUser("pro", async (sql) => {
    await updateProfile(sql, professional, {
      slug: "the-studio",
      businessName: "Studio",
      bio: "An independent nail studio in London.",
      city: "London",
      category: "Nails",
      publicationStatus: "published",
    });
    service = (
      await saveService(sql, professional, {
        name: "Nails",
        description: "",
        durationMinutes: 60,
        pricePence: 4500,
        depositPence: 1500,
        active: true,
      })
    ).id as string;
    asset = (
      await sql.query<{ id: string }>(
        "INSERT INTO beauty.portfolio_assets(professional_id,blob_path,alt_text) VALUES($1,'private/asset.webp','A blue gel manicure') RETURNING id",
        [professional],
      )
    ).rows[0].id;
  });
  booking = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) VALUES($1,$2,$3,'Nails','Customer','Studio',now()+interval '2 hours',now()+interval '3 hours',60,4500,1500,'confirmed',now()) RETURNING id",
      [professional, customer, service],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO beauty.payments(booking_id,captured_pence,status,stripe_payment_intent_id,updated_at) VALUES($1,1500,'paid','pi_refund',now()-interval '2 hours')",
    [booking],
  );
});
afterAll(() => db.close());
describe.sequential("private media, notification delivery and refunds", () => {
  it("keeps time-off labels private and prevents cross-account removal", async () => {
    const block = await asUser("pro", (sql) =>
      addTimeOff(sql, professional, {
        startDate: "2030-07-01",
        endDate: "2030-07-02",
        label: "Private holiday",
      }),
    );
    expect(
      (
        await asUser("customer", (sql) =>
          sql.query("SELECT * FROM beauty.availability_blocks"),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      asUser("customer", (sql) => removeTimeOff(sql, professional, block.id)),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asUser("customer", (sql) =>
        addTimeOff(sql, professional, {
          startDate: "2030-07-03",
          endDate: "2030-07-03",
          label: "Forged block",
        }),
      ),
    ).rejects.toThrow("FORBIDDEN");
    await asUser("pro", (sql) => removeTimeOff(sql, professional, block.id));
  });
  it("rejects time off across confirmed appointments and active checkout holds", async () => {
    const input = {
      startDate: "2000-01-01",
      endDate: "2100-01-01",
      label: "Closed",
    };
    const today = (
      await db.query<{ date: string }>(
        "SELECT to_char((now()+interval '2 hours') AT TIME ZONE 'Europe/London','YYYY-MM-DD') AS date",
      )
    ).rows[0].date;
    input.startDate = today;
    input.endDate = today;
    await expect(
      asUser("pro", (sql) => addTimeOff(sql, professional, input)),
    ).rejects.toThrow("BOOKING_CONFLICT");
    await db.query(
      "UPDATE beauty.bookings SET status='payment_pending',hold_expires_at=now()+interval '20 minutes' WHERE id=$1",
      [booking],
    );
    await expect(
      asUser("pro", (sql) => addTimeOff(sql, professional, input)),
    ).rejects.toThrow("BOOKING_CONFLICT");
    await db.query(
      "UPDATE beauty.bookings SET status='confirmed' WHERE id=$1",
      [booking],
    );
  });
  it("stores a partial-day break and protects an appointment at its boundaries", async () => {
    const input = {
      startDate: "2030-07-04",
      endDate: "2030-07-04",
      startTime: "12:00",
      endTime: "13:00",
      label: "Private lunch",
    };
    const appointment = (
      await db.query<{ id: string }>(
        "INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) VALUES($1,$2,$3,'Nails','Customer','Studio','2030-07-04T12:00:00Z','2030-07-04T13:00:00Z',60,4500,1500,'confirmed',now()) RETURNING id",
        [professional, customer, service],
      )
    ).rows[0].id;
    const block = await asUser("pro", (sql) =>
      addTimeOff(sql, professional, input),
    );
    const stored = (
      await asUser("pro", (sql) =>
        sql.query<{ label: string }>(
          "SELECT label FROM beauty.availability_blocks WHERE id=$1",
          [block.id],
        ),
      )
    ).rows[0];
    expect(stored.label).toBe("Private lunch");
    await expect(
      asUser("pro", (sql) =>
        addTimeOff(sql, professional, { ...input, endTime: "13:01" }),
      ),
    ).rejects.toThrow("BOOKING_CONFLICT");
    await expect(
      asUser("customer", (sql) => addTimeOff(sql, professional, input)),
    ).rejects.toThrow("FORBIDDEN");
    await asUser("pro", (sql) => removeTimeOff(sql, professional, block.id));
    await db.query("DELETE FROM beauty.bookings WHERE id=$1", [appointment]);
  });
  it("keeps unpublished image paths private", async () => {
    expect(
      (
        await asUser("", (sql) =>
          sql.query("SELECT * FROM beauty.published_asset_paths"),
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await asUser("customer", (sql) =>
          sql.query("SELECT * FROM beauty.portfolio_assets"),
        )
      ).rows,
    ).toEqual([]);
  });
  it("publishes only through explicit owner visibility", async () => {
    await asUser("pro", (sql) =>
      sql.query(
        "UPDATE beauty.portfolio_assets SET publication_status='published' WHERE id=$1",
        [asset],
      ),
    );
    const result = await asUser("", (sql) =>
      sql.query("SELECT * FROM beauty.public_portfolio"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).not.toHaveProperty("blob_path");
  });
  it("a hidden profile also hides its image paths", async () => {
    await db.query(
      "UPDATE beauty.professional_profiles SET publication_status='hidden' WHERE id=$1",
      [professional],
    );
    expect(
      (
        await asUser("", (sql) =>
          sql.query("SELECT * FROM beauty.published_asset_paths"),
        )
      ).rows,
    ).toEqual([]);
    await db.query(
      "UPDATE beauty.professional_profiles SET publication_status='published' WHERE id=$1",
      [professional],
    );
  });
  it("claims notification jobs once and acknowledges delivery", async () => {
    await db.query(
      "INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id) VALUES($1,'confirmation',$2)",
      [booking, customer],
    );
    const jobs = await worker((sql) =>
      sql.query<{ id: string; email: string }>(
        "SELECT * FROM beauty.claim_notifications()",
      ),
    );
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0].email).toBe("customer@example.test");
    expect(
      (
        await worker((sql) =>
          sql.query("SELECT * FROM beauty.claim_notifications()"),
        )
      ).rows,
    ).toEqual([]);
    await worker((sql) =>
      sql.query("SELECT beauty.finish_notification($1,true)", [
        jobs.rows[0].id,
      ]),
    );
    expect(
      (
        await worker((sql) =>
          sql.query("SELECT * FROM beauty.claim_notifications()"),
        )
      ).rows,
    ).toEqual([]);
  });
  it("cannot access the email queue with a customer credential", async () => {
    await expect(
      asUser("customer", (sql) =>
        sql.query("SELECT * FROM beauty.claim_notifications()"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("does not let customers choose their own refund percentage", async () => {
    await asUser("customer", (sql) =>
      sql.query(
        "SELECT beauty.change_booking($1,'cancelled','Unable to attend today')",
        [booking],
      ),
    );
    await expect(
      asUser("customer", (sql) =>
        sql.query(
          "SELECT beauty.decide_refund($1,true,100,'Customer chooses own refund')",
          [booking],
        ),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("records a professional's case-by-case partial refund once", async () => {
    const result = await asUser("pro", (sql) =>
      sql.query<{ data: { id: string; amountPence: number } }>(
        "SELECT beauty.decide_refund($1,true,40,'Exceptional situation accepted') AS data",
        [booking],
      ),
    );
    decision = result.rows[0].data.id;
    expect(result.rows[0].data.amountPence).toBe(600);
    const retry = await asUser("pro", (sql) =>
      sql.query<{ data: { id: string; amountPence: number } }>(
        "SELECT beauty.decide_refund($1,true,90,'Changed input on retry') AS data",
        [booking],
      ),
    );
    expect(retry.rows[0].data).toMatchObject({
      id: decision,
      amountPence: 600,
    });
  });
  it("rejects a refund from a different payment or amount", async () => {
    await expect(
      worker((sql) =>
        sql.query(
          "SELECT beauty.apply_refund_result($1,'re_test',600,'succeeded','pi_other')",
          [decision],
        ),
      ),
    ).rejects.toThrow("REFUND_MISMATCH");
    await expect(
      worker((sql) =>
        sql.query(
          "SELECT beauty.apply_refund_result($1,'re_test',700,'succeeded','pi_refund')",
          [decision],
        ),
      ),
    ).rejects.toThrow("REFUND_MISMATCH");
  });
  it("applies verified refund success once", async () => {
    for (let attempt = 0; attempt < 2; attempt++)
      await worker((sql) =>
        sql.query(
          "SELECT beauty.apply_refund_result($1,'re_test',600,'succeeded','pi_refund')",
          [decision],
        ),
      );
    expect(
      (
        await db.query<{ refunded_pence: number }>(
          "SELECT refunded_pence FROM beauty.payments WHERE booking_id=$1",
          [booking],
        )
      ).rows[0].refunded_pence,
    ).toBe(600);
  });
});

import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";

const db = new PGlite();
let professional: string;
let customer: string;
let admin: string;
let booking: string;
let appeal: string;
async function asUser<T>(
  authId: string,
  verified: boolean,
  fn: (sql: SqlClient) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    if (verified)
      await tx.query("SELECT set_config('app.admin_verified','true',true)");
    return fn(tx);
  });
}
beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  for (const authId of ["pro", "customer", "other", "admin"]) {
    const account = await asUser(authId, false, (sql) =>
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
    if (authId === "customer") customer = account.id;
    if (authId === "admin") admin = account.id;
  }
  await db.query(
    "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
    [admin],
  );
  const service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,duration_minutes,price_pence,deposit_pence) VALUES($1,'Nails',60,5000,1500) RETURNING id",
      [professional],
    )
  ).rows[0].id;
  booking = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at,cancelled_at,cancellation_actor) VALUES($1,$2,$3,'Nails','Customer','Studio',now()+interval '2 hours',now()+interval '3 hours',60,5000,1500,'cancelled',now(),now(),'customer') RETURNING id",
      [professional, customer, service],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO beauty.payments(booking_id,captured_pence,status,stripe_payment_intent_id,updated_at) VALUES($1,1500,'paid','pi_appeal',now()-interval '2 hours')",
    [booking],
  );
  await asUser("pro", false, (sql) =>
    sql.query(
      "SELECT beauty.decide_refund($1,false,0,'Late cancellation was not accepted')",
      [booking],
    ),
  );
});
afterAll(() => db.close());

describe.sequential("refund appeals", () => {
  it("only lets the affected customer read or submit an appeal", async () => {
    await expect(
      asUser("other", false, (sql) =>
        sql.query(
          "SELECT beauty.submit_refund_appeal($1,'This is not my appointment')",
          [booking],
        ),
      ),
    ).rejects.toThrow("INVALID_REQUEST");
    const result = await asUser("customer", false, (sql) =>
      sql.query<{ data: { id: string; status: string } }>(
        "SELECT beauty.submit_refund_appeal($1,'Please review the circumstances of this cancellation') AS data",
        [booking],
      ),
    );
    appeal = result.rows[0].data.id;
    expect(result.rows[0].data.status).toBe("open");
    expect(
      (
        await asUser("other", false, (sql) =>
          sql.query("SELECT * FROM beauty.refund_appeals"),
        )
      ).rows,
    ).toEqual([]);
  });
  it("requires verified admin access and a valid percentage to resolve", async () => {
    await expect(
      asUser("admin", false, (sql) =>
        sql.query(
          "SELECT beauty.resolve_refund_appeal($1,true,50,'Accepted after reviewing the appeal')",
          [appeal],
        ),
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asUser("admin", true, (sql) =>
        sql.query(
          "SELECT beauty.resolve_refund_appeal($1,true,0,'Invalid zero percent approval')",
          [appeal],
        ),
      ),
    ).rejects.toThrow("INVALID_REQUEST");
  });
  it("queues one admin-approved partial refund and writes an audit record", async () => {
    const result = await asUser("admin", true, (sql) =>
      sql.query<{ data: { amountPence: number; status: string } }>(
        "SELECT beauty.resolve_refund_appeal($1,true,40,'Accepted after reviewing the appeal') AS data",
        [appeal],
      ),
    );
    expect(result.rows[0].data).toEqual({
      amountPence: 600,
      status: "queued",
      decisionId: expect.any(String),
      paymentIntentId: "pi_appeal",
    });
    await expect(
      asUser("admin", true, (sql) =>
        sql.query(
          "SELECT beauty.resolve_refund_appeal($1,true,40,'A second decision should be rejected')",
          [appeal],
        ),
      ),
    ).rejects.toThrow("INVALID_REQUEST");
    expect(
      (
        await db.query<{ action: string }>(
          "SELECT action FROM beauty.admin_audit_logs WHERE target_user_id=$1",
          [customer],
        )
      ).rows[0].action,
    ).toContain("refund_appeal");
  });
});

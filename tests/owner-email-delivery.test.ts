import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveService } from "@/modules/professionals/repository";
import type { OwnerEmailDeliveryOverview } from "@/modules/admin/repository";

const db = await createTestDatabase();
const migration = await readFile(
  new URL(
    "../db/migrations/20261012220208_fix_owner_email_delivery_read_access.sql",
    import.meta.url,
  ),
  "utf8",
);
const ids: Record<string, string> = {};
async function asUser<T>(
  authId: string,
  work: (sql: SqlClient) => Promise<T>,
  verified = true,
) {
  return db.transaction(async (sql) => {
    await sql.exec("SET LOCAL ROLE beauty_app");
    await sql.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    if (verified)
      await sql.query("SELECT set_config('app.admin_verified','true',true)");
    return work(sql);
  });
}
const overview = (who = "owner", verified = true) =>
  asUser(
    who,
    async (sql) =>
      (
        await sql.query<{ data: OwnerEmailDeliveryOverview }>(
          "SELECT beauty.owner_email_delivery_overview() AS data",
        )
      ).rows[0].data,
    verified,
  );

beforeAll(async () => {
  await applyTestMigrations(db);
  for (const authId of ["owner", "admin", "customer", "professional"]) {
    const user = await asUser(
      authId,
      (sql) =>
        enrolAccount(
          sql,
          {
            authId,
            email: `${authId}@example.test`,
            displayName: authId,
            secondFactorAge: null,
          },
          authId === "professional" ? "professional" : "customer",
        ),
      false,
    );
    ids[authId] = user.id;
    if (user.professionalId) ids.profile = user.professionalId;
    if (["owner", "admin"].includes(authId))
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,$2)",
        [user.id, authId],
      );
  }
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [ids.profile],
  );
  const service = await asUser("professional", (sql) =>
    saveService(sql, ids.profile, {
      name: "Manicure",
      description: "Email report fixture",
      durationMinutes: 60,
      pricePence: 4500,
      depositPence: 1500,
      active: true,
    }),
  );
  const booking = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,
      starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at)
     VALUES($1,$2,$3,'Manicure','Customer','Studio',now()+interval '2 days',now()+interval '2 days 1 hour',60,4500,1500,'confirmed',now()) RETURNING id`,
      [ids.profile, ids.customer, service.id],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO beauty.notification_outbox(booking_id,kind,recipient_user_id) VALUES($1,'confirmation',$2)",
    [booking, ids.customer],
  );
  await db.query(
    `INSERT INTO beauty.product_orders(checkout_reference,provider_payment_intent_id,customer_id,professional_id,
      professional_name,subtotal_pence,delivery_pence,total_pence,recipient_name,address_line1,city,postcode,country_code)
     VALUES(gen_random_uuid(),'pi_email_report_fixture',$1,$2,'Studio',5000,399,5399,'Customer','1 Test Street','London','SE1 1AA','GB')`,
    [ids.customer, ids.profile],
  );
  await db.query(
    `UPDATE beauty.product_notification_outbox SET sent_at=now(),
    delivery_status=CASE WHEN recipient_user_id=$1 THEN 'delivered' ELSE 'sent' END,
    provider_event_at=CASE WHEN recipient_user_id=$1 THEN '2026-10-12T12:00:00Z'::timestamptz ELSE '2026-10-11T12:00:00Z'::timestamptz END`,
    [ids.customer],
  );
  await db.query(
    "INSERT INTO beauty.email_suppressions(email,reason) VALUES('blocked@example.test','bounced')",
  );
});
afterAll(() => db.close());

describe.sequential("Owner email delivery reads", () => {
  const expected = {
    queued: 1,
    accepted: 1,
    delivered: 1,
    bounced: 0,
    complained: 0,
    failed: 0,
    suppressed: 1,
    lastProviderEventAt: "2026-10-12T12:00:00+00:00",
  };
  it("reproduces the production permission error and the silent undercount without an RLS policy, then repairs both", async () => {
    await db.exec(`REVOKE SELECT(sent_at,delivery_status,provider_event_at) ON beauty.product_notification_outbox FROM beauty_admin_ops;
      DROP POLICY product_notification_outbox_admin_delivery_read ON beauty.product_notification_outbox;`);
    try {
      await expect(overview()).rejects.toThrow(
        "permission denied for table product_notification_outbox",
      );
      await db.exec(
        "GRANT SELECT(sent_at,delivery_status,provider_event_at) ON beauty.product_notification_outbox TO beauty_admin_ops",
      );
      expect(await overview()).toMatchObject({
        queued: 1,
        accepted: 0,
        delivered: 0,
        lastProviderEventAt: null,
      });
    } finally {
      await db.exec(
        "REVOKE SELECT(sent_at,delivery_status,provider_event_at) ON beauty.product_notification_outbox FROM beauty_admin_ops",
      );
      await db.exec(migration);
    }
    expect(await overview()).toEqual(expected);
  });
  it("reads aggregate delivery health without changing settings, jobs or suppressions", async () => {
    const snapshot = async () => ({
      settings: (
        await db.query(
          "SELECT key,value FROM beauty.platform_settings ORDER BY key",
        )
      ).rows,
      jobs: (
        await db.query(
          "SELECT * FROM beauty.product_notification_outbox ORDER BY id",
        )
      ).rows,
      suppressions: (
        await db.query("SELECT * FROM beauty.email_suppressions ORDER BY email")
      ).rows,
    });
    const before = await snapshot();
    expect(await overview()).toEqual(expected);
    expect(await snapshot()).toEqual(before);
  });
  it.each(["sent", "delivered", "bounced", "complained", "failed"])(
    "includes Shop %s counts with booking counts",
    async (status) => {
      await db.query(
        "UPDATE beauty.product_notification_outbox SET delivery_status=$1",
        [status],
      );
      const data = await overview();
      const key =
        status === "sent"
          ? "accepted"
          : (status as keyof OwnerEmailDeliveryOverview);
      expect(data[key]).toBe(2);
      expect(data.queued).toBe(1);
    },
  );
  it.each([
    ["", true],
    ["customer", true],
    ["admin", true],
    ["owner", false],
  ] as const)(
    "keeps the verified Owner boundary (%s, verified=%s)",
    async (who, verified) => {
      await expect(overview(who, verified)).rejects.toThrow("FORBIDDEN");
    },
  );
  it("grants only report columns to the internal role and no raw access to website/browser roles", async () => {
    for (const column of ["sent_at", "delivery_status", "provider_event_at"]) {
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "SELECT has_column_privilege('beauty_admin_ops','beauty.product_notification_outbox',$1,'SELECT') AS allowed",
            [column],
          )
        ).rows[0].allowed,
      ).toBe(true);
    }
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_column_privilege('beauty_admin_ops','beauty.product_notification_outbox','recipient_user_id','SELECT') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    for (const role of ["beauty_app", "anon", "authenticated"]) {
      await expect(
        db.transaction(async (sql) => {
          await sql.exec(`SET LOCAL ROLE ${role}`);
          await sql.query(
            "SELECT count(*) FROM beauty.product_notification_outbox",
          );
        }),
      ).rejects.toThrow(/permission denied/);
    }
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_table_privilege('beauty_admin_ops','beauty.product_notification_outbox','UPDATE') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
});

import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = await createTestDatabase();
const users: Record<string, string> = {};
let pro: string, service: string, id: string;
async function as<T>(
  who: string,
  work: (sql: SqlClient) => Promise<T>,
  verified = false,
) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query(
      "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
      [who, String(verified)],
    );
    return work(tx);
  });
}
const customer = <T extends Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
) => as("customer", (db) => db.query<T>(sql, args));
const worker = <T>(sql: string, args: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return tx.query<T>(sql, args);
  });
async function reserve() {
  return (
    await customer<{ data: { token: string } }>(
      "SELECT beauty.reserve_customer_journey_route($1) AS data",
      [id],
    )
  ).rows[0].data.token;
}
const payload = {
  durationMinutes: 30,
  bufferMinutes: 10,
  mode: "driving",
  reminders: true,
  automaticUpdates: true,
};
async function save(token: string, value: object = payload) {
  return customer(
    "SELECT beauty.save_customer_journey_route($1,$2,$3::jsonb,$4)",
    [id, token, JSON.stringify(value), "v1.encrypted.fixture.origin"],
  );
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const who of ["pro", "customer", "stranger", "owner"]) {
    const a = await as(who, (sql) =>
      enrolAccount(
        sql,
        {
          authId: who,
          email: `${who}@example.test`,
          displayName: who,
          secondFactorAge: null,
        },
        who === "pro" ? "professional" : "customer",
      ),
    );
    users[who] = a.id;
    if (who === "pro") pro = a.professionalId!;
  }
  await db.query(
    "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin'),($1,'owner')",
    [users.owner],
  );
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [pro],
  );
  service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence,active) VALUES($1,'Fixture','',60,5000,1500,true) RETURNING id",
      [pro],
    )
  ).rows[0].id;
});
beforeEach(async () => {
  await db.query(
    "UPDATE beauty.arrival_settings SET smart_arrival=true,journey_planner=true,departure_reminders=true,routing_enabled=true,routing_daily_limit=100,routing_monthly_limit=3000,scheduler_tick_at=now()",
  );
  await db.query("DELETE FROM beauty.journey_routing_usage");
  await db.query(
    "UPDATE beauty.appointment_journey_routes SET auto_refresh=false,origin_ciphertext=NULL",
  );
  id = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) VALUES($1,$2,$3,'Fixture','Customer','Pro',now()+interval '2 hours',now()+interval '3 hours',60,5000,1500,'confirmed',now()+interval '30 minutes') RETURNING id",
      [pro, users.customer, service],
    )
  ).rows[0].id;
  await as("pro", (sql) =>
    sql.query("SELECT beauty.appointment_arrival_action($1,$2::jsonb)", [
      id,
      JSON.stringify({
        action: "configure",
        enabled: true,
        latitude: 51.5,
        longitude: -0.1,
        instructions: "Use the main entrance.",
        expectedVersion: 0,
      }),
    ]),
  );
});
afterAll(() => db.close());
it("denies professional, unrelated customer and direct runtime access to private origins and budget helpers", async () => {
  for (const who of ["pro", "stranger"])
    await expect(
      as(who, (sql) =>
        sql.query("SELECT beauty.reserve_customer_journey_route($1)", [id]),
      ),
    ).rejects.toThrow("FORBIDDEN");
  await expect(
    customer("SELECT * FROM beauty.appointment_journey_routes"),
  ).rejects.toThrow("permission denied");
  await expect(
    customer("SELECT beauty.spend_journey_routing_request()"),
  ).rejects.toThrow("permission denied");
});
it("reserves budget before a call, rate-limits repeat requests and rejects forged or replayed completions", async () => {
  const token = await reserve();
  expect(
    (
      await db.query<{ requests: number }>(
        "SELECT requests FROM beauty.journey_routing_usage",
      )
    ).rows[0].requests,
  ).toBe(1);
  await expect(reserve()).rejects.toThrow("ROUTE_RATE_LIMIT");
  await expect(save("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
    "ROUTE_CHANGED",
  );
  await save(token);
  await expect(save(token)).rejects.toThrow("ROUTE_CHANGED");
  const visible = (
    await customer<{ data: object }>(
      "SELECT beauty.customer_journey_route($1) AS data",
      [id],
    )
  ).rows[0].data;
  expect(visible).toMatchObject({ automaticUpdates: true });
  expect(JSON.stringify(visible)).not.toContain("encrypted");
});
it("enforces both daily and monthly limits without spending a failed reservation", async () => {
  await db.query(
    "INSERT INTO beauty.journey_routing_usage(day,requests) VALUES((now() AT TIME ZONE 'UTC')::date,100)",
  );
  await expect(reserve()).rejects.toThrow("ROUTE_BUDGET_LIMIT");
  await db.query(
    "UPDATE beauty.arrival_settings SET routing_daily_limit=10000,routing_monthly_limit=100",
  );
  await expect(reserve()).rejects.toThrow("ROUTE_BUDGET_LIMIT");
  expect(
    (
      await db.query<{ requests: number }>(
        "SELECT requests FROM beauty.journey_routing_usage",
      )
    ).rows[0].requests,
  ).toBe(100);
});
it.each(["cancel", "reschedule", "location"])(
  "invalidates an in-flight route on %s",
  async (change) => {
    const token = await reserve();
    if (change === "cancel")
      await db.query(
        "UPDATE beauty.bookings SET status='cancelled' WHERE id=$1",
        [id],
      );
    if (change === "reschedule")
      await db.query(
        "UPDATE beauty.bookings SET starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' WHERE id=$1",
        [id],
      );
    if (change === "location")
      await db.query(
        "UPDATE beauty.appointment_arrivals SET version=version+1 WHERE booking_id=$1",
        [id],
      );
    await expect(save(token)).rejects.toThrow("ROUTE_CHANGED");
  },
);
it("clears encrypted origins and leases immediately on customer stop and manual-plan changes", async () => {
  await save(await reserve());
  await customer("SELECT beauty.stop_customer_route_refresh($1)", [id]);
  expect(
    (
      await db.query(
        "SELECT origin_ciphertext,auto_refresh,request_token FROM beauty.appointment_journey_routes WHERE booking_id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({
    origin_ciphertext: null,
    auto_refresh: false,
    request_token: null,
  });
  await db.query(
    "UPDATE beauty.appointment_journey_routes SET requested_at=now()-interval '1 minute'",
  );
  await save(await reserve());
  await customer("SELECT beauty.appointment_arrival_action($1,$2::jsonb)", [
    id,
    JSON.stringify({
      action: "plan",
      durationMinutes: 40,
      bufferMinutes: 10,
      mode: "walking",
      reminders: true,
    }),
  ]);
  expect(
    (
      await db.query(
        "SELECT origin_ciphertext,auto_refresh FROM beauty.appointment_journey_routes WHERE booking_id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ origin_ciphertext: null, auto_refresh: false });
});
it("claims scheduled refreshes once and changes the plan only after a valid lease completes", async () => {
  await save(await reserve());
  await db.query(
    "UPDATE beauty.appointment_journey_routes SET next_refresh_at=now()-interval '1 minute',requested_at=now()-interval '1 minute' WHERE booking_id=$1",
    [id],
  );
  const jobs = await worker<{
    data: { token: string; bookingId: string; ciphertext: string };
  }>("SELECT beauty.claim_journey_route_refreshes() AS data");
  expect(jobs.rows).toHaveLength(1);
  expect(jobs.rows[0].data.ciphertext).toContain("encrypted");
  expect(
    (await worker("SELECT beauty.claim_journey_route_refreshes()")).rows,
  ).toHaveLength(0);
  const token = jobs.rows[0].data.token;
  await worker("SELECT beauty.finish_journey_route($1,$2,$3::jsonb,$4)", [
    id,
    token,
    JSON.stringify({ ...payload, durationMinutes: 45 }),
    "v1.encrypted.fixture.origin",
  ]);
  expect(
    (
      await db.query(
        "SELECT duration_minutes,revision FROM beauty.appointment_journey_plans WHERE booking_id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ duration_minutes: 45, revision: 2 });
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM beauty.in_app_notifications WHERE booking_id=$1 AND title='Your journey estimate has changed'",
        [id],
      )
    ).rows[0],
  ).toEqual({ n: 1 });
});
it("clears origins at departure and when reminders or routing are disabled", async () => {
  await save(await reserve());
  await db.query(
    "UPDATE beauty.appointment_journey_plans SET departure_at=now()-interval '1 minute' WHERE booking_id=$1",
    [id],
  );
  await worker("SELECT beauty.cleanup_journey_routes()");
  expect(
    (
      await db.query(
        "SELECT origin_ciphertext,auto_refresh FROM beauty.appointment_journey_routes WHERE booking_id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ origin_ciphertext: null, auto_refresh: false });
  await db.query(
    "UPDATE beauty.appointment_journey_routes SET origin_ciphertext='v1.fixture',auto_refresh=true WHERE booking_id=$1",
    [id],
  );
  await db.query("UPDATE beauty.arrival_settings SET routing_enabled=false");
  expect(
    (
      await db.query(
        "SELECT origin_ciphertext,auto_refresh FROM beauty.appointment_journey_routes WHERE booking_id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ origin_ciphertext: null, auto_refresh: false });
});
it("requires Owner MFA and reports only aggregate routing/delivery readiness", async () => {
  const p = {
    enabled: false,
    dailyLimit: 80,
    monthlyLimit: 2000,
    refreshMinutes: 15,
    changeMinutes: 5,
  };
  const change = (sql: SqlClient) =>
    sql.query(
      "SELECT beauty.owner_journey_routing_settings($1::jsonb,'Reviewed fixture budget')",
      [JSON.stringify(p)],
    );
  await expect(as("owner", change)).rejects.toThrow("FORBIDDEN");
  await expect(as("customer", change, true)).rejects.toThrow("FORBIDDEN");
  await as("owner", change, true);
  const overview = (
    await as(
      "owner",
      (sql) =>
        sql.query<{ data: object }>(
          "SELECT beauty.admin_journey_routing_overview() AS data",
        ),
      true,
    )
  ).rows[0].data;
  expect(overview).toMatchObject({
    enabled: false,
    dailyLimit: 80,
    registeredDevices: 0,
    deviceDisplayed: 0,
  });
  expect(JSON.stringify(overview)).not.toMatch(
    /origin|latitude|ciphertext|customer_name/,
  );
});
it("queues a requested customer test only to their selected device and records display/click separately", async () => {
  const device = (
    await customer<{ id: string }>(
      "SELECT beauty.save_customer_journey_push($1,$2,$3,$4) AS id",
      [
        id,
        "https://fcm.googleapis.com/fcm/send/fixture",
        "a".repeat(87),
        "b".repeat(22),
      ],
    )
  ).rows[0].id;
  await expect(
    as("stranger", (sql) =>
      sql.query("SELECT beauty.test_customer_journey_push($1,$2)", [
        id,
        device,
      ]),
    ),
  ).rejects.toThrow("FORBIDDEN");
  await customer("SELECT beauty.test_customer_journey_push($1,$2)", [
    id,
    device,
  ]);
  await expect(
    customer("SELECT beauty.test_customer_journey_push($1,$2)", [id, device]),
  ).rejects.toThrow("INVALID_REQUEST");
  const deliveries = await db.query<{ id: string }>(
    "SELECT d.id FROM beauty.push_deliveries d JOIN beauty.in_app_notifications n ON n.id=d.notification_id WHERE n.booking_id=$1 AND n.kind='push_test'",
    [id],
  );
  expect(deliveries.rows).toHaveLength(1);
  const delivery = deliveries.rows[0].id;
  await expect(
    customer("SELECT beauty.record_push_device_receipt($1,'displayed')", [
      delivery,
    ]),
  ).rejects.toThrow("permission denied");
  await worker("SELECT beauty.record_push_device_receipt($1,'displayed')", [
    delivery,
  ]);
  let row = (
    await db.query<{ displayed_at: string | null; clicked_at: string | null }>(
      "SELECT displayed_at,clicked_at FROM beauty.push_deliveries WHERE id=$1",
      [delivery],
    )
  ).rows[0];
  expect(row.displayed_at).not.toBeNull();
  expect(row.clicked_at).toBeNull();
  await worker("SELECT beauty.record_push_device_receipt($1,'clicked')", [
    delivery,
  ]);
  row = (
    await db.query<{ displayed_at: string | null; clicked_at: string | null }>(
      "SELECT clicked_at FROM beauty.push_deliveries WHERE id=$1",
      [delivery],
    )
  ).rows[0];
  expect(row.clicked_at).not.toBeNull();
});
it("does not duplicate the same leave-reminder stage across refreshed plan revisions", async () => {
  for (const revision of [1, 2])
    await db.query(
      "SELECT beauty.arrival_notify($1,$2,'Leave in approximately 15 minutes','Saved estimate',$3,true)",
      [id, users.customer, `departure:${id}:${revision}:15`],
    );
  await db.query(
    "SELECT beauty.arrival_notify($1,$2,'It’s time to leave for your appointment','Saved estimate',$3,true)",
    [id, users.customer, `departure:${id}:2:now`],
  );
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM beauty.in_app_notifications WHERE booking_id=$1 AND kind='journey_departure'",
        [id],
      )
    ).rows[0].n,
  ).toBe(2);
});

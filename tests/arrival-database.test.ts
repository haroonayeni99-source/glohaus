import { beforeAll, afterAll, it, expect } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { arrivalAction, arrivalState } from "@/modules/arrival/repository";
import type { ArrivalAction } from "@/modules/arrival/domain";
const db = await createTestDatabase();
const users: Record<string, string> = {};
let pro: string, service: string;
async function as<T>(
  authId: string,
  work: (sql: SqlClient) => Promise<T>,
  verified = false,
) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query(
      "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
      [authId, String(verified)],
    );
    return work(tx);
  });
}
async function worker<T>(work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return work(tx);
  });
}
async function booking() {
  return (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at)
 VALUES($1,$2,$3,'Fixture beauty service','Customer','Studio',now()+interval '30 minutes',now()+interval '90 minutes',60,5000,1500,'confirmed',now()+interval '30 minutes') RETURNING id`,
      [pro, users.customer, service],
    )
  ).rows[0].id;
}
const point = { latitude: 51.5074, longitude: -0.1278 };
async function configured(id: string) {
  await as("pro", (sql) =>
    arrivalAction(sql, id, {
      action: "configure",
      enabled: true,
      ...point,
      instructions: "Ring the studio bell at the main entrance.",
      expectedVersion: 0,
    }),
  );
}
const act = (who: string, id: string, p: ArrivalAction) =>
  as(who, (sql) => arrivalAction(sql, id, p));
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const name of ["pro", "otherpro", "customer", "stranger", "owner"]) {
    const a = await as(name, (sql) =>
      enrolAccount(
        sql,
        {
          authId: name,
          email: `${name}@example.test`,
          displayName: name,
          secondFactorAge: null,
        },
        name.includes("pro") ? "professional" : "customer",
      ),
    );
    users[name] = a.id;
    if (name === "pro") pro = a.professionalId!;
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
      "INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence,active) VALUES($1,'Fixture beauty service','',60,5000,1500,true) RETURNING id",
      [pro],
    )
  ).rows[0].id;
});
afterAll(() => db.close());
it("starts disabled and refuses activation by either participant", async () => {
  const id = await booking();
  const state = await as("customer", (sql) => arrivalState(sql, id));
  expect(state.config.smartArrival).toBe(false);
  await expect(configured(id)).rejects.toThrow("ARRIVAL_UNAVAILABLE");
});
it("requires Owner and MFA for feature switches and audits the change", async () => {
  await worker((sql) => sql.query("SELECT beauty.arrival_scheduler_tick()"));
  const value = {
    smartArrival: true,
    journeyPlanner: true,
    journeySharing: true,
    departureReminders: true,
    radiusM: 100,
    defaultBuffer: 10,
  };
  const query = (sql: SqlClient) =>
    sql.query(
      "SELECT beauty.owner_arrival_settings($1::jsonb,'Enable isolated fixture rollout')",
      [JSON.stringify(value)],
    );
  await expect(as("pro", query, true)).rejects.toThrow();
  await expect(as("owner", query, false)).rejects.toThrow();
  await as("owner", query, true);
  expect(
    (
      await db.query(
        "SELECT action FROM beauty.admin_audit_logs WHERE action='arrival.settings'",
      )
    ).rows,
  ).toHaveLength(1);
});
it("scopes location confirmation to the booked professional and blocks customer/pro cross-access", async () => {
  const id = await booking();
  await expect(as("stranger", (sql) => arrivalState(sql, id))).rejects.toThrow(
    "FORBIDDEN",
  );
  await expect(
    act("otherpro", id, {
      action: "configure",
      enabled: true,
      ...point,
      instructions: "",
      expectedVersion: 0,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    act("customer", id, {
      action: "configure",
      enabled: true,
      ...point,
      instructions: "",
      expectedVersion: 0,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await configured(id);
  const info = await as("customer", (sql) => arrivalState(sql, id));
  expect(info.arrival?.version).toBe(1);
  expect(info.arrival?.acknowledged_at).toBeNull();
});
it("requires the current instructions acknowledgement and independent customer consent", async () => {
  const id = await booking();
  await configured(id);
  await expect(
    act("customer", id, { action: "consent", enabled: true }),
  ).rejects.toThrow("ARRIVAL_ACK_REQUIRED");
  await expect(
    act("pro", id, { action: "consent", enabled: true }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    act("customer", id, { action: "acknowledge", version: 2 }),
  ).rejects.toThrow("ARRIVAL_CHANGED");
  await act("customer", id, { action: "acknowledge", version: 1 });
  const a = await act("customer", id, { action: "consent", enabled: true });
  expect(a.arrival?.consent_at).not.toBeNull();
  expect(
    (
      await db.query(
        "SELECT * FROM beauty.booking_location_sessions WHERE booking_id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(0);
});
it("keeps browser-reported display distinct from explicit acknowledgement", async () => {
  const id = await booking();
  await configured(id);
  for (let n = 0; n < 2; n++)
    await as("customer", (sql) =>
      sql.query("SELECT beauty.arrival_prompt_shown($1,1)", [id]),
    );
  const events = (await as("customer", (sql) => arrivalState(sql, id))).events;
  expect(events.filter((e) => e.kind === "shown")).toHaveLength(1);
  expect(events.some((e) => e.kind === "acknowledged")).toBe(false);
});
it("rejects replayed or future readings and ignores low-accuracy readings", async () => {
  const id = await booking();
  await configured(id);
  await act("customer", id, { action: "acknowledge", version: 1 });
  await act("customer", id, { action: "consent", enabled: true });
  const sample = {
    action: "reading" as const,
    ...point,
    accuracyM: 3000,
    observedAt: new Date().toISOString(),
  };
  const a = await act("customer", id, sample);
  expect(a.arrival?.detected_at).toBeNull();
  expect(a.arrival?.detection_status).toBe("unreliable");
  await expect(act("customer", id, sample)).rejects.toThrow("INVALID_REQUEST");
  await expect(
    act("customer", id, {
      ...sample,
      observedAt: new Date(Date.now() + 120000).toISOString(),
    }),
  ).rejects.toThrow("INVALID_REQUEST");
});
it("requires two reliable readings and preserves the first server arrival timestamp", async () => {
  const id = await booking();
  await configured(id);
  await act("customer", id, { action: "acknowledge", version: 1 });
  await act("customer", id, { action: "consent", enabled: true });
  let a = await act("customer", id, {
    action: "reading",
    ...point,
    accuracyM: 10,
    observedAt: new Date(Date.now() - 1000).toISOString(),
  });
  expect(a.arrival?.detected_at).toBeNull();
  await db.query(
    "UPDATE beauty.appointment_arrivals SET candidate_at=now()-interval '6 seconds',last_reading_at=now()-interval '6 seconds' WHERE booking_id=$1",
    [id],
  );
  a = await act("customer", id, {
    action: "reading",
    ...point,
    accuracyM: 10,
    observedAt: new Date().toISOString(),
  });
  expect(a.arrival?.detected_at).not.toBeNull();
  const first = a.arrival!.detected_at;
  a = await act("customer", id, {
    action: "reading",
    ...point,
    accuracyM: 10,
    observedAt: new Date().toISOString(),
  });
  expect(a.arrival?.detected_at).toBe(first);
  expect(a.arrival?.attendance_at).toBeNull();
  expect(a.status).toBe("confirmed");
  expect(
    (
      await db.query(
        "SELECT * FROM beauty.in_app_notifications WHERE booking_id=$1 AND kind='arrival_update'",
        [id],
      )
    ).rows,
  ).toHaveLength(4);
});
it("allows a manual fallback without location permission and separates attendance/start/completion", async () => {
  const id = await booking();
  await configured(id);
  let a = await act("customer", id, { action: "manual" });
  expect(a.arrival?.manual_at).not.toBeNull();
  expect(a.arrival?.detected_at).toBeNull();
  await expect(act("customer", id, { action: "attendance" })).rejects.toThrow(
    "FORBIDDEN",
  );
  await expect(act("pro", id, { action: "started" })).rejects.toThrow(
    "INVALID_REQUEST",
  );
  a = await act("pro", id, { action: "attendance" });
  expect(a.arrival?.attendance_at).not.toBeNull();
  a = await act("pro", id, { action: "started" });
  expect(a.arrival?.started_at).not.toBeNull();
  expect(a.status).toBe("confirmed");
  const n = a.events.length;
  expect((await act("pro", id, { action: "started" })).events).toHaveLength(n);
});
it("prevents either participant overwriting authoritative arrival records", async () => {
  const id = await booking();
  await configured(id);
  await act("customer", id, { action: "manual" });
  await expect(
    act("pro", id, {
      action: "configure",
      enabled: true,
      ...point,
      instructions: "Changed",
      expectedVersion: 1,
    }),
  ).rejects.toThrow("ARRIVAL_ALREADY_RECORDED");
  await expect(
    as("customer", (sql) =>
      sql.query(
        "UPDATE beauty.appointment_arrivals SET manual_at=now() WHERE booking_id=$1",
        [id],
      ),
    ),
  ).rejects.toThrow("permission denied");
});
it("saves only customer-private duration and mode, never a home address, and calculates departure", async () => {
  const id = await booking();
  await configured(id);
  const value = await act("customer", id, {
    action: "plan",
    durationMinutes: 35,
    bufferMinutes: 10,
    mode: "transit",
    reminders: true,
  });
  expect(
    new Date(value.startsAt).getTime() -
      new Date(value.plan!.departure_at).getTime(),
  ).toBe(45 * 60000);
  expect((await as("pro", (sql) => arrivalState(sql, id))).plan).toBeNull();
  await expect(
    as("pro", (sql) =>
      sql.query("SELECT * FROM beauty.appointment_journey_plans"),
    ),
  ).rejects.toThrow("permission denied");
});
it("notifies only the booked professional of a customer-reported delay, rate limits duplicates and leaves payments untouched", async () => {
  const id = await booking();
  await configured(id);
  const a = await act("customer", id, { action: "late", eta: null });
  expect(a.events.some((e) => e.kind === "late")).toBe(true);
  await expect(
    act("customer", id, { action: "late", eta: null }),
  ).rejects.toThrow("ARRIVAL_RATE_LIMIT");
  expect(a.status).toBe("confirmed");
  expect(
    (
      await as("otherpro", (sql) =>
        sql.query(
          "SELECT id FROM beauty.in_app_notifications WHERE booking_id=$1",
          [id],
        ),
      )
    ).rows,
  ).toHaveLength(0);
});
it("requires reacknowledgement after location changes, revokes sharing and disables old plans", async () => {
  const id = await booking();
  await configured(id);
  await act("customer", id, { action: "acknowledge", version: 1 });
  await act("customer", id, { action: "consent", enabled: true });
  await act("customer", id, {
    action: "plan",
    durationMinutes: 20,
    bufferMinutes: 5,
    mode: "walking",
    reminders: true,
  });
  const a = await act("pro", id, {
    action: "configure",
    enabled: true,
    ...point,
    instructions: "Use the side entrance.",
    expectedVersion: 1,
  });
  expect(a.arrival?.version).toBe(2);
  expect(a.arrival?.acknowledged_at).toBeNull();
  expect(a.arrival?.consent_at).toBeNull();
  expect(
    (await as("customer", (sql) => arrivalState(sql, id))).plan,
  ).toBeNull();
});
it("deduplicates departure reminders server-side and invalidates unsent notices when cancelled", async () => {
  const id = await booking();
  await configured(id);
  await act("customer", id, {
    action: "plan",
    durationMinutes: 10,
    bufferMinutes: 5,
    mode: "driving",
    reminders: true,
  });
  await worker((sql) => sql.query("SELECT beauty.prepare_arrival_reminders()"));
  await worker((sql) => sql.query("SELECT beauty.prepare_arrival_reminders()"));
  const rows = (
    await db.query<{ id: string }>(
      "SELECT id FROM beauty.in_app_notifications WHERE booking_id=$1 AND kind='journey_departure'",
      [id],
    )
  ).rows;
  expect(rows).toHaveLength(1);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "SELECT beauty.arrival_notice_current($1) ok",
        [rows[0].id],
      )
    ).rows[0].ok,
  ).toBe(true);
  await db.query("UPDATE beauty.bookings SET status='cancelled' WHERE id=$1", [
    id,
  ]);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "SELECT beauty.arrival_notice_current($1) ok",
        [rows[0].id],
      )
    ).rows[0].ok,
  ).toBe(false);
});
it("revokes live coordinates on cancellation and prevents professional access even before cleanup", async () => {
  const id = await booking();
  await configured(id);
  await as("customer", (sql) =>
    sql.query(
      `INSERT INTO beauty.booking_location_sessions(booking_id,customer_id,professional_id,expires_at,last_latitude,last_longitude,last_accuracy_m,last_observed_at) SELECT id,customer_id,professional_id,ends_at,51.5,-0.12,10,now() FROM beauty.bookings WHERE id=$1`,
      [id],
    ),
  );
  expect(
    (
      await as("pro", (sql) =>
        sql.query(
          "SELECT * FROM beauty.booking_location_sessions WHERE booking_id=$1",
          [id],
        ),
      )
    ).rows,
  ).toHaveLength(1);
  await db.query("UPDATE beauty.bookings SET status='cancelled' WHERE id=$1", [
    id,
  ]);
  expect(
    (
      await as("pro", (sql) =>
        sql.query(
          "SELECT * FROM beauty.booking_location_sessions WHERE booking_id=$1",
          [id],
        ),
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query<{ last_latitude: number | null }>(
        "SELECT last_latitude FROM beauty.booking_location_sessions WHERE booking_id=$1",
        [id],
      )
    ).rows[0].last_latitude,
  ).toBeNull();
});
it("lets Owner review delivery separately from read/acknowledged and append a correction without live tracking", async () => {
  const id = await booking();
  await configured(id);
  await act("customer", id, {
    action: "dispute",
    reason: "The location was near the building but I had not entered.",
  });
  await as(
    "owner",
    (sql) =>
      sql.query(
        "SELECT beauty.admin_arrival_correction($1,'Reviewed evidence: proximity does not establish attendance.')",
        [id],
      ),
    true,
  );
  const data = (
    await as(
      "owner",
      (sql) =>
        sql.query<{ data: Record<string, unknown> }>(
          "SELECT beauty.admin_arrival_overview($1) data",
          [id],
        ),
      true,
    )
  ).rows[0].data;
  expect(data).not.toHaveProperty("liveLocation");
  expect(data.communications).toBeDefined();
  const communications = data.communications as {
    recipient_role: string;
    recipient_name: string;
    body: string;
  }[];
  expect(
    communications.some(
      (n) =>
        n.recipient_role === "customer" &&
        n.recipient_name === "Customer" &&
        n.body.includes("version 1"),
    ),
  ).toBe(true);
  expect(
    (await as("customer", (sql) => arrivalState(sql, id))).events.some(
      (e) => e.kind === "correction",
    ),
  ).toBe(true);
  await expect(
    as("pro", (sql) =>
      sql.query("SELECT beauty.admin_arrival_overview($1)", [id]),
    ),
  ).rejects.toThrow();
});
it("denies public roles and preserves forced RLS on every new table", async () => {
  const policies = await db.query<{
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(
    "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN('appointment_arrivals','appointment_arrival_events','appointment_journey_plans','arrival_settings')",
  );
  expect(policies.rows).toHaveLength(4);
  expect(
    policies.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
  ).toBe(true);
  await expect(
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE anon");
      await tx.query("SELECT beauty.appointment_arrival($1)", [
        "00000000-0000-4000-8000-000000000000",
      ]);
    }),
  ).rejects.toThrow();
});

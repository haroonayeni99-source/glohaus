import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import ICAL from "ical.js";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { createSubscription, revokeSubscription, subscriptionBookings, subscriptionCalendar, subscriptionClaims, subscriptionReady } from "@/modules/business-tools/subscription";
const identity = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/db", () => ({ withIdentity: identity.run }));
import { GET } from "@/app/api/calendar/subscription/[token]/route";
const db = await createTestDatabase();
const authId = "subscription-owner";
let pro: string, otherPro: string;
async function as<T>(caller: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async tx => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [caller]);
    return work(tx);
  });
}
function tokenFrom(url: string) { return url.split("/").at(-1)!; }
beforeAll(async () => {
  process.env.BUSINESS_TOOLS_ENCRYPTION_KEY = "12".repeat(32);
  await applyTestMigrations(db);
  await db.exec(await readFile("db/proposals/20261122_calendar_subscriptions.sql", "utf8"));
  for (const caller of [authId, "subscription-other"])
    await as(caller, async sql => {
      const a = await enrolAccount(sql, { authId: caller, email: `${caller}@example.test`, displayName: caller, secondFactorAge: null }, "professional");
      if (caller === authId) pro = a.professionalId!; else otherPro = a.professionalId!;
    });
  identity.run.mockImplementation(as);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
afterAll(async () => { delete process.env.BUSINESS_TOOLS_ENCRYPTION_KEY; await db.close(); });
describe("private calendar subscription", () => {
  it("is disabled unless explicitly enabled", () => {
    vi.stubEnv("CALENDAR_SUBSCRIPTION_ENABLED", "");
    expect(subscriptionReady()).toBe(false);
    vi.stubEnv("CALENDAR_SUBSCRIPTION_ENABLED", "true");
    expect(subscriptionReady()).toBe(true);
  });
  it("encrypts identity, stores only a digest and rejects tampering", async () => {
    const url = await as(authId, sql => createSubscription(sql, authId, pro));
    const token = tokenFrom(url);
    expect(token).not.toContain(authId);
    expect(subscriptionClaims(token)).toMatchObject({ authId, professionalId: pro });
    expect(() => subscriptionClaims(token.replace(/^v1/, "v2"))).toThrow();
    const rows = await as(authId, sql => sql.query("SELECT token_hash FROM beauty.calendar_subscriptions"));
    expect(rows.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rows.rows)).not.toContain(token);
    expect(await as(authId, sql => subscriptionBookings(sql, pro, token))).toEqual([]);
  });
  it("prevents cross-professional reads, writes and revocation through actual RLS", async () => {
    const token = tokenFrom(await as(authId, sql => createSubscription(sql, authId, pro)));
    expect(await as("subscription-other", sql => subscriptionBookings(sql, pro, token))).toBeNull();
    await expect(as("subscription-other", sql => createSubscription(sql, "subscription-other", pro))).rejects.toThrow();
    await as("subscription-other", sql => revokeSubscription(sql, pro));
    expect(await as(authId, sql => subscriptionBookings(sql, pro, token))).toEqual([]);
    expect(await as(authId, sql => subscriptionBookings(sql, otherPro, token))).toBeNull();
  });
  it("invalidates old links on regeneration and revocation", async () => {
    const old = tokenFrom(await as(authId, sql => createSubscription(sql, authId, pro)));
    const current = tokenFrom(await as(authId, sql => createSubscription(sql, authId, pro)));
    expect(current).not.toBe(old);
    expect(await as(authId, sql => subscriptionBookings(sql, pro, old))).toBeNull();
    expect(await as(authId, sql => subscriptionBookings(sql, pro, current))).toEqual([]);
    await as(authId, sql => revokeSubscription(sql, pro));
    expect(await as(authId, sql => subscriptionBookings(sql, pro, current))).toBeNull();
  });
  it("revokes access immediately when an owner is suspended", async () => {
    const token = tokenFrom(await as(authId, sql => createSubscription(sql, authId, pro)));
    await db.query("UPDATE beauty.users SET status='suspended' WHERE auth_id=$1", [authId]);
    try { expect(await as(authId, sql => subscriptionBookings(sql, pro, token))).toBeNull(); }
    finally { await db.query("UPDATE beauty.users SET status='active' WHERE auth_id=$1", [authId]); }
  });
  it("keeps UIDs stable across changes, emits UTC and cancelled tombstones without personal data", () => {
    const b = { id: "11111111-1111-4111-8111-111111111111", starts_at: "2026-03-29T10:00:00+01:00", ends_at: "2026-03-29T11:00:00+01:00", status: "confirmed", customer_name: "Secret Customer", service_name: "Private treatment" };
    const first = subscriptionCalendar([b]);
    const changed = subscriptionCalendar([{ ...b, starts_at: "2026-10-25T10:00:00Z", ends_at: "2026-10-25T11:00:00Z", status: "cancelled" }]);
    const event = (text: string) => new ICAL.Component(ICAL.parse(text)).getFirstSubcomponent("vevent")!;
    expect(event(first).getFirstPropertyValue("uid")).toBe(event(changed).getFirstPropertyValue("uid"));
    expect(first).toContain("DTSTART:20260329T090000Z");
    expect(changed).toContain("STATUS:CANCELLED\r\nTRANSP:TRANSPARENT");
    expect(first).not.toMatch(/Secret Customer|Private treatment/);
    expect(first.split("\r\n").every(line => Buffer.byteLength(line) <= 75)).toBe(true);
  });
  it("never emits a successful empty calendar on DB failure and hides tokens in error output", async () => {
    vi.stubEnv("CALENDAR_SUBSCRIPTION_ENABLED", "true");
    const token = tokenFrom(await as(authId, sql => createSubscription(sql, authId, pro)));
    identity.run.mockRejectedValueOnce(Error("private database failure"));
    const response = await GET(new Request("https://www.glohaus.shop/api/calendar/subscription/test"), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe("");
  });
  it("returns a real calendar only for an active token; disabled or invalid links return 404", async () => {
    vi.stubEnv("CALENDAR_SUBSCRIPTION_ENABLED", "true");
    const token = tokenFrom(await as(authId, sql => createSubscription(sql, authId, pro)));
    const request = new Request("https://www.glohaus.shop/api/calendar/subscription/test");
    const response = await GET(request, { params: Promise.resolve({ token }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(await response.text()).toContain("BEGIN:VCALENDAR");
    await as(authId, sql => revokeSubscription(sql, pro));
    expect((await GET(request, { params: Promise.resolve({ token }) })).status).toBe(404);
    vi.stubEnv("CALENDAR_SUBSCRIPTION_ENABLED", "false");
    expect((await GET(request, { params: Promise.resolve({ token }) })).status).toBe(404);
  });
});

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile, saveService } from "@/modules/professionals/repository";
import { saveSchedule } from "@/modules/availability/repository";
const identity = vi.hoisted(() => ({ run: vi.fn(), worker: vi.fn() }));
vi.mock("@/lib/db", () => ({ withIdentity: identity.run }));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: identity.worker,
}));
vi.mock("@/modules/business-tools/ics", async (original) => ({
  ...(await original<typeof import("@/modules/business-tools/ics")>()),
  fetchFeed: vi.fn(),
}));
import { fetchFeed } from "@/modules/business-tools/ics";
import {
  storeConnection,
  syncProfessional,
} from "@/modules/business-tools/repository";
import { unseal } from "@/modules/business-tools/secrets";
import {
  refreshServiceCalendars,
  runBusinessToolsWorker,
} from "@/modules/business-tools/worker";
const db = await createTestDatabase();
let pro: string, service: string;
const authId = "calendar-sync-fixture";
const start = new Date(Date.now() + 7 * 86400000);
start.setUTCHours(12, 0, 0, 0);
const startsAt = start.toISOString(),
  endsAt = new Date(start.getTime() + 3600000).toISOString();
const calendarTime = (iso: string) =>
  iso.replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "");
const feed = (from = startsAt, to = endsAt, status = "") =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:fixture-private-id\r\nDTSTART:${calendarTime(from)}\r\nDTEND:${calendarTime(to)}\r\nSUMMARY:Private appointment name\r\n${status ? `STATUS:${status}\r\n` : ""}END:VEVENT\r\nEND:VCALENDAR`;
async function as<T>(caller: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [caller]);
    return work(tx);
  });
}
async function connect(label = "Subscribed calendar") {
  return as(authId, (sql) =>
    storeConnection(sql, pro, "ics", label, {
      accessToken: "",
      expiresAt: 0,
      feedUrl: "https://calendar.example.test/private-feed.ics",
    }),
  );
}
async function reserve(at = startsAt) {
  return as(
    "calendar-sync-customer",
    async (sql) =>
      (
        await sql.query<{ data: { id: string } }>(
          "SELECT beauty.reserve_booking($1,$2,beauty.public_service_policy($1)->>'token',true) AS data",
          [service, at],
        )
      ).rows[0].data.id,
  );
}
beforeAll(async () => {
  await applyTestMigrations(db);
  identity.run.mockImplementation(as);
  identity.worker.mockImplementation(
    (work: (sql: SqlClient) => Promise<unknown>) =>
      db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE beauty_payment_worker");
        return work(tx);
      }),
  );
  for (const caller of [authId, "calendar-sync-customer"])
    await as(caller, async (sql) => {
      const account = await enrolAccount(
        sql,
        {
          authId: caller,
          email: `${caller}@example.test`,
          displayName: caller,
          secondFactorAge: null,
        },
        caller === authId ? "professional" : "customer",
      );
      if (caller === authId) pro = account.professionalId!;
    });
  await as(authId, async (sql) => {
    await updateProfile(sql, pro, {
      slug: "calendar-sync-fixture",
      businessName: "Calendar sync fixture",
      bio: "Fictional professional for calendar synchronisation tests.",
      city: "London",
      category: "Nails",
      publicationStatus: "published",
    });
    service = (
      await saveService(sql, pro, {
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
      pro,
      Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startMinute: 480,
        endMinute: 1200,
      })),
    );
    await sql.query(
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_calendar_sync_fixture')",
      [pro],
    );
  });
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    await tx.query(
      "SELECT beauty.sync_connect_account('acct_calendar_sync_fixture',true)",
    );
    await tx.query(
      "SELECT beauty.sync_connect_verification('acct_calendar_sync_fixture',true)",
    );
  });
});
beforeEach(() => {
  vi.stubEnv("BUSINESS_TOOLS_ENCRYPTION_KEY", "ab".repeat(32));
  vi.mocked(fetchFeed).mockResolvedValue(feed());
});
afterEach(async () => {
  await db.query(
    "DELETE FROM beauty.business_connections WHERE professional_id=$1",
    [pro],
  );
  await db.query(
    "DELETE FROM beauty.availability_blocks WHERE professional_id=$1",
    [pro],
  );
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => db.close());
describe("real calendar sync transactions with a simulated external feed", () => {
  it("imports busy times atomically, stores encrypted credentials and blocks an overlapping booking", async () => {
    const c = await connect();
    expect(await syncProfessional(authId, pro, c.id)).toEqual({
      synced: 1,
      failed: 0,
    });
    const status = await db.query<{
      status: string;
      successes: number;
      secret_ciphertext: string;
    }>(
      "SELECT status,successes,secret_ciphertext FROM beauty.business_connections WHERE id=$1",
      [c.id],
    );
    expect(status.rows[0]).toMatchObject({ status: "connected", successes: 1 });
    expect(status.rows[0].secret_ciphertext).not.toContain("private-feed");
    expect(
      unseal(status.rows[0].secret_ciphertext, `${pro}:ics`),
    ).toMatchObject({
      feedUrl: "https://calendar.example.test/private-feed.ics",
    });
    const busy = await db.query(
      "SELECT event_key,starts_at,ends_at FROM beauty.external_calendar_busy WHERE connection_id=$1",
      [c.id],
    );
    expect(busy.rows).toHaveLength(1);
    expect(JSON.stringify(busy.rows)).not.toContain("Private appointment");
    await expect(reserve()).rejects.toThrow("SLOT_TAKEN");
  });
  it("deduplicates repeated imports and replaces rescheduled external events", async () => {
    const c = await connect();
    await syncProfessional(authId, pro, c.id);
    await syncProfessional(authId, pro, c.id);
    expect(
      (
        await db.query(
          "SELECT * FROM beauty.external_calendar_busy WHERE connection_id=$1",
          [c.id],
        )
      ).rows,
    ).toHaveLength(1);
    const moved = new Date(start.getTime() + 2 * 3600000).toISOString();
    vi.mocked(fetchFeed).mockResolvedValue(
      feed(moved, new Date(start.getTime() + 3 * 3600000).toISOString()),
    );
    await syncProfessional(authId, pro, c.id);
    const row = (
      await db.query<{ starts_at: Date }>(
        "SELECT starts_at FROM beauty.external_calendar_busy WHERE connection_id=$1",
        [c.id],
      )
    ).rows[0];
    expect(new Date(row.starts_at).toISOString()).toBe(moved);
  });
  it("removes cancelled appointments without changing manually blocked time", async () => {
    const c = await connect();
    await as(authId, (sql) =>
      sql.query(
        "INSERT INTO beauty.availability_blocks(professional_id,starts_at,ends_at,label) VALUES($1,$2,$3,'Private regular client')",
        [
          pro,
          new Date(start.getTime() + 4 * 3600000).toISOString(),
          new Date(start.getTime() + 5 * 3600000).toISOString(),
        ],
      ),
    );
    await syncProfessional(authId, pro, c.id);
    vi.mocked(fetchFeed).mockResolvedValue(feed(startsAt, endsAt, "CANCELLED"));
    await syncProfessional(authId, pro, c.id);
    expect(
      (
        await db.query(
          "SELECT * FROM beauty.external_calendar_busy WHERE connection_id=$1",
          [c.id],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "SELECT * FROM beauty.availability_blocks WHERE professional_id=$1",
          [pro],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("keeps the last busy snapshot on an outage and pauses new bookings", async () => {
    const c = await connect();
    await syncProfessional(authId, pro, c.id);
    vi.mocked(fetchFeed).mockRejectedValue(Error("SYNC_FAILED"));
    expect(await syncProfessional(authId, pro, c.id)).toEqual({
      synced: 0,
      failed: 1,
    });
    const row = (
      await db.query(
        "SELECT status,last_error,failures FROM beauty.business_connections WHERE id=$1",
        [c.id],
      )
    ).rows[0];
    expect(row).toMatchObject({
      status: "error",
      last_error: "SYNC_FAILED",
      failures: 1,
    });
    expect(
      (
        await db.query(
          "SELECT * FROM beauty.external_calendar_busy WHERE connection_id=$1",
          [c.id],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(reserve()).rejects.toThrow("CALENDAR_UNAVAILABLE");
  });
  it("cannot sync another professional's connection", async () => {
    const c = await connect();
    expect(await syncProfessional("calendar-sync-customer", pro, c.id)).toEqual(
      { synced: 0, failed: 0 },
    );
    expect(fetchFeed).not.toHaveBeenCalled();
  });
  it("does not restore a connection disconnected during an in-flight download", async () => {
    const c = await connect();
    let release!: (value: string) => void;
    let started!: () => void;
    const downloading = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(fetchFeed).mockImplementationOnce(() => {
      started();
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    });
    const syncing = syncProfessional(authId, pro, c.id);
    await downloading;
    await as(authId, (sql) =>
      sql.query(
        "UPDATE beauty.business_connections SET status='disconnected',secret_ciphertext='' WHERE id=$1",
        [c.id],
      ),
    );
    release(feed());
    expect(await syncing).toEqual({ synced: 0, failed: 0 });
    expect(
      (
        await db.query(
          "SELECT status,secret_ciphertext FROM beauty.business_connections WHERE id=$1",
          [c.id],
        )
      ).rows[0],
    ).toEqual({ status: "disconnected", secret_ciphertext: "" });
    expect(
      (
        await db.query(
          "SELECT * FROM beauty.external_calendar_busy WHERE connection_id=$1",
          [c.id],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("enforces the connection cap while permitting reconnection of an existing calendar", async () => {
    const initial = await connect("Calendar 0");
    for (let i = 1; i < 8; i++) await connect(`Calendar ${i}`);
    await expect(connect("Calendar 8")).rejects.toThrow("TOO_MANY_CONNECTIONS");
    expect((await connect("Calendar 0")).id).toBe(initial.id);
  });
  it.skipIf(process.env.GLOHAUS_PUBLIC_FEED_SMOKE !== "1")(
    "fetches the official public GOV.UK calendar over real HTTPS and commits its busy snapshot",
    async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/business-tools/ics")
      >("@/modules/business-tools/ics");
      let transportError: unknown;
      vi.mocked(fetchFeed).mockImplementationOnce(async (url) => {
        try {
          return await actual.fetchFeed(url);
        } catch (error) {
          transportError = error;
          throw error;
        }
      });
      const c = await as(authId, (sql) =>
        storeConnection(sql, pro, "ics", "GOV.UK public feed smoke test", {
          accessToken: "",
          expiresAt: 0,
          feedUrl: "https://www.gov.uk/bank-holidays/england-and-wales.ics",
        }),
      );
      const result = await syncProfessional(authId, pro, c.id);
      expect(transportError).toBeUndefined();
      expect(result).toEqual({ synced: 1, failed: 0 });
      const row = (
        await db.query(
          "SELECT status,successes,last_error FROM beauty.business_connections WHERE id=$1",
          [c.id],
        )
      ).rows[0];
      expect(row).toMatchObject({
        status: "connected",
        successes: 1,
        last_error: null,
      });
      expect(fetchFeed).toHaveBeenCalledWith(
        "https://www.gov.uk/bank-holidays/england-and-wales.ics",
      );
    },
  );

  it("refreshes every one of eight calendars before allowing a booking preflight", async () => {
    for (let i = 0; i < 8; i++) await connect(`Preflight ${i}`);
    await expect(
      refreshServiceCalendars(service, true),
    ).resolves.toBeUndefined();
    expect(fetchFeed).toHaveBeenCalledTimes(8);
    const rows = await db.query<{ status: string }>(
      "SELECT status FROM beauty.business_connections WHERE professional_id=$1",
      [pro],
    );
    expect(rows.rows).toHaveLength(8);
    expect(rows.rows.every((row) => row.status === "connected")).toBe(true);
  });
  it("recovers a queued connection through the real worker routing function", async () => {
    const c = await connect();
    expect(await runBusinessToolsWorker()).toEqual({
      configured: true,
      synced: 1,
      failed: 0,
    });
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM beauty.business_connections WHERE id=$1",
          [c.id],
        )
      ).rows[0].status,
    ).toBe("connected");
  });
});

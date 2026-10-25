import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: async (work: (db: unknown) => unknown) =>
    work({ query: mocks.query }),
}));
vi.mock("@/modules/journey-routing/worker", () => ({
  refreshJourneyRoutes: mocks.refresh,
}));
vi.mock("@/modules/notifications/push-worker", () => ({
  deliverPushNotifications: mocks.push,
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));
import { runNotificationWorker } from "@/modules/notifications/worker";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "fixture-only");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.refresh.mockResolvedValue({
    configured: false,
    processed: 0,
    updated: 0,
  });
  mocks.push.mockResolvedValue({ configured: true, processed: 1, accepted: 1 });
  mocks.send.mockResolvedValue({ data: { id: "email-fixture" } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("does not require Google credentials to prepare manual departure reminders or send push", async () => {
  const response = await runNotificationWorker();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    preparationFailures: [],
    push: { accepted: 1 },
  });
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.prepare_arrival_reminders()",
  );
});

it("continues reminders, push and email after route refresh fails, and records a failed run", async () => {
  mocks.refresh.mockRejectedValue(
    new Error("private origin and provider credentials"),
  );
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("claim_notifications()")
      ? [
          {
            id: "notice",
            booking_id: "booking",
            kind: "confirmation",
            email: "fixture@example.test",
            service_name: "Fixture",
            professional_name: "Fixture Studio",
            starts_at: "2026-11-01T12:00:00Z",
          },
        ]
      : [],
  }));
  const response = await runNotificationWorker();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    preparationFailures: ["journeyRouting"],
    sent: 1,
  });
  expect(mocks.push).toHaveBeenCalledOnce();
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.prepare_arrival_reminders()",
  );
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.record_backend_job_run($1,$2,$3::jsonb)",
    ["notifications", false, expect.stringContaining("JOURNEY_REFRESH_FAILED")],
  );
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "private origin",
  );
});

it.each([
  ["payoutStatus", "prepare_payout_status_notifications"],
  ["arrivalReminders", "prepare_arrival_reminders"],
  ["professionalNotifications", "prepare_professional_notifications"],
  ["professionalPromotions", "prepare_professional_promotions"],
])(
  "isolates a failed %s preparation from the other queues",
  async (stage, statement) => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes(statement)) throw new Error("database unavailable");
      return { rows: [] };
    });
    const response = await runNotificationWorker();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      preparationFailures: [stage],
      push: { accepted: 1 },
    });
    expect(mocks.query).toHaveBeenCalledWith(
      "SELECT beauty.prepare_professional_promotions()",
    );
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        sql.includes("claim_notifications()"),
      ),
    ).toBe(true);
  },
);

it("still processes emails when the push worker fails and exposes a retryable status", async () => {
  mocks.push.mockRejectedValue(new Error("provider offline"));
  const response = await runNotificationWorker();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    push: { error: "PUSH_WORKER_FAILED" },
  });
  expect(
    mocks.query.mock.calls.some(([sql]) =>
      sql.includes("claim_notifications()"),
    ),
  ).toBe(true);
});

it("still processes push when email credentials are absent", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  const response = await runNotificationWorker();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    emailConfigured: false,
    push: { accepted: 1 },
  });
});

const supportJob = {
  id: "support-job",
  request_id: "private-case",
  kind: "new",
};

it("counts failed and abandoned attempts without flagging another worker's active claim", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA beauty;
      CREATE TABLE beauty.support_email_jobs(accepted_at timestamptz,attempts integer,locked_at timestamptz);
      INSERT INTO beauty.support_email_jobs VALUES
       (NULL,1,now()),(NULL,8,now()),(NULL,2,NULL),(NULL,8,NULL),
       (NULL,3,now()-interval '6 minutes'),(now(),8,NULL),(NULL,0,NULL);`);
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("FROM beauty.support_email_jobs")
        ? db.query(sql)
        : { rows: [] },
    );
    const response = await runNotificationWorker();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      supportEmail: { queued: 6, retrying: 2, exhausted: 1 },
    });
    expect(mocks.send).not.toHaveBeenCalled();
  } finally {
    await db.close();
  }
});

it("records support provider acceptance separately from delivery", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("claim_support_emails()") ? [supportJob] : [],
  }));
  const response = await runNotificationWorker();
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.supportEmail).toEqual({
    processed: 1,
    accepted: 1,
    queued: 0,
    retrying: 0,
    exhausted: 0,
  });
  expect(result.supportEmail).not.toHaveProperty("delivered");
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.finish_support_email($1,$2)",
    ["support-job", "email-fixture"],
  );
});

it("reports failed support delivery as degraded while still sending other transactional email", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("claim_support_emails()")
      ? [supportJob]
      : sql.includes("FROM beauty.support_email_jobs")
        ? [{ queued: 1, retrying: 1, exhausted: 0 }]
        : sql.includes("claim_notifications()")
          ? [
              {
                id: "notice",
                booking_id: "booking",
                kind: "confirmation",
                email: "fixture@example.test",
                service_name: "Fixture",
                professional_name: "Fixture Studio",
                starts_at: "2026-11-01T12:00:00Z",
              },
            ]
          : [],
  }));
  mocks.send.mockRejectedValueOnce(new Error("private provider credential"));
  const response = await runNotificationWorker();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    supportEmail: { accepted: 0, retrying: 1 },
    preparationFailures: ["supportEmail"],
    sent: 1,
  });
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.finish_support_email($1,$2)",
    ["support-job", null],
  );
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.record_backend_job_run($1,$2,$3::jsonb)",
    ["notifications", false, expect.stringContaining('"retrying":1')],
  );
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "private provider credential",
  );
});

it("keeps exhausted support alerts visible even when no job is claimable, then recovers after resolution", async () => {
  let exhausted = 1;
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("FROM beauty.support_email_jobs")
      ? [{ queued: exhausted, retrying: 0, exhausted }]
      : [],
  }));
  const failed = await runNotificationWorker();
  expect(failed.status).toBe(503);
  expect(await failed.json()).toMatchObject({
    supportEmail: { processed: 0, exhausted: 1 },
    preparationFailures: ["supportEmail"],
  });
  expect(mocks.send).not.toHaveBeenCalled();
  exhausted = 0;
  const recovered = await runNotificationWorker();
  expect(recovered.status).toBe(200);
  expect(await recovered.json()).toMatchObject({
    supportEmail: { exhausted: 0 },
    preparationFailures: [],
  });
});

it("isolates an unavailable support queue and exposes only a safe diagnostic code", async () => {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("claim_support_emails()"))
      throw new Error("private database connection");
    return { rows: [] };
  });
  const response = await runNotificationWorker();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    supportEmail: { error: "SUPPORT_EMAIL_CHECK_FAILED" },
    preparationFailures: ["supportEmail"],
  });
  expect(
    mocks.query.mock.calls.some(([sql]) =>
      sql.includes("claim_professional_alert_emails()"),
    ),
  ).toBe(true);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "private database connection",
  );
});

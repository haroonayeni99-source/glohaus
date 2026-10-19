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

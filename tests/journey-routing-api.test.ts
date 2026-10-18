import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  estimate: vi.fn(),
  configured: true,
  denied: false,
  schedule: vi.fn(),
}));
vi.mock("@/lib/api-account", () => ({
  withAccount: async (_role: string, work: (db: unknown) => unknown) => {
    if (m.denied) throw new AccessError("UNAUTHENTICATED", 401);
    return work({ query: m.query });
  },
}));
vi.mock("@/modules/journey-routing/crypto", () => ({
  routingConfigured: () => m.configured,
  encryptOrigin: () => "v1.encrypted",
}));
vi.mock("@/modules/journey-routing/google", () => ({
  estimateRoute: m.estimate,
}));
vi.mock("@/modules/notifications/schedule", () => ({
  scheduleNotificationDelivery: m.schedule,
}));
import {
  GET,
  POST,
  DELETE,
} from "@/app/api/v1/bookings/[id]/journey-route/route";
import { POST as receipt } from "@/app/api/v1/notifications/push-receipt/route";
import { pushReceiptToken } from "@/modules/notifications/device-receipts";
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: async (work: (db: unknown) => unknown) =>
    work({ query: m.query }),
}));
const id = "11111111-1111-4111-8111-111111111111",
  ctx = { params: Promise.resolve({ id }) };
const body = {
  origin: { address: "Private starting address" },
  mode: "driving",
  bufferMinutes: 10,
  reminders: true,
  automaticUpdates: true,
  providerConsent: true,
};
function req(
  value: unknown = body,
  method = "POST",
  origin = "https://glohaus.test",
) {
  return new Request(
    `https://glohaus.test/api/v1/bookings/${id}/journey-route`,
    {
      method,
      headers: { origin, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(value),
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.configured = true;
  m.denied = false;
  vi.stubEnv("CRON_SECRET", "test-secret");
  m.query.mockImplementation(async (sql: string) => ({
    rows: [
      {
        data: sql.includes("reserve_customer")
          ? {
              bookingId: id,
              token: id,
              startsAt: "2026-10-20T12:00:00Z",
              latitude: 51.5,
              longitude: -0.1,
            }
          : { enabled: true },
      },
    ],
  }));
  m.estimate.mockResolvedValue({
    durationMinutes: 35,
    provider: "Google Maps",
  });
});
afterEach(() => vi.unstubAllEnvs());
it("rejects signed-out, cross-origin, unconsented and forged-destination requests before calling a provider", async () => {
  m.denied = true;
  expect((await POST(req(), ctx)).status).toBe(401);
  expect((await GET(req({}, "GET"), ctx)).status).toBe(401);
  m.denied = false;
  expect((await POST(req(body, "POST", "https://evil.test"), ctx)).status).toBe(
    403,
  );
  expect(
    (await POST(req({ ...body, providerConsent: false }), ctx)).status,
  ).toBe(400);
  expect((await POST(req({ ...body, latitude: 1 }), ctx)).status).toBe(400);
  expect(m.estimate).not.toHaveBeenCalled();
});
it("authenticates before checking configuration, and does not reserve paid requests when unconfigured", async () => {
  m.configured = false;
  expect((await POST(req(), ctx)).status).toBe(503);
  expect(m.query).toHaveBeenCalledOnce();
  expect(m.query.mock.calls[0][0]).toContain("customer_journey_route");
  expect(m.estimate).not.toHaveBeenCalled();
});
it("sends only the trusted destination to the provider, saves encrypted consented origin and returns private data", async () => {
  const response = await POST(req(), ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.estimate).toHaveBeenCalledWith(
    body.origin,
    expect.objectContaining({ latitude: 51.5, longitude: -0.1 }),
    "driving",
    10,
  );
  const save = m.query.mock.calls.find(([sql]) =>
    sql.includes("save_customer_journey_route"),
  );
  expect(save?.[1]).toEqual([id, id, expect.any(String), "v1.encrypted"]);
  expect(JSON.stringify(save)).not.toContain("Private starting address");
  expect(m.schedule).toHaveBeenCalledOnce();
});
it("does not persist the origin for one-off estimates and revokes in-flight refresh on stop", async () => {
  expect(
    (await POST(req({ ...body, automaticUpdates: false }), ctx)).status,
  ).toBe(200);
  expect(
    m.query.mock.calls.find(([sql]) =>
      sql.includes("save_customer_journey_route"),
    )?.[1][3],
  ).toBeNull();
  expect((await DELETE(req({}, "DELETE"), ctx)).status).toBe(200);
  expect(m.query).toHaveBeenLastCalledWith(
    "SELECT beauty.stop_customer_route_refresh($1)",
    [id],
  );
});
it("requires a signed receipt capability and records the specific display/click without claiming understanding", async () => {
  expect(
    (await receipt(req({ token: "forged", kind: "displayed" }))).status,
  ).toBe(401);
  expect(m.query).not.toHaveBeenCalled();
  const token = pushReceiptToken(id)!;
  const r = await receipt(req({ token, kind: "displayed" }));
  expect(r.status).toBe(200);
  expect(m.query).toHaveBeenCalledWith(
    "SELECT beauty.record_push_device_receipt($1,$2)",
    [id, "displayed"],
  );
  expect(await r.json()).toEqual({ recorded: true });
});

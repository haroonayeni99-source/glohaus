import { beforeEach, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  allowed: true,
  role: "customer",
  schedule: vi.fn(),
}));
vi.mock("@/lib/api-account", () => ({
  withAccount: async (role: string, work: (db: object) => unknown) => {
    if (!mocks.allowed) throw new AccessError("UNAUTHENTICATED", 401);
    if (mocks.role !== role) throw new AccessError("FORBIDDEN", 403);
    return work({ query: mocks.query });
  },
}));
vi.mock("@/modules/notifications/schedule", () => ({
  scheduleNotificationDelivery: mocks.schedule,
}));
import { GET, PATCH } from "@/app/api/v1/account/notification-settings/route";
import { POST } from "@/app/api/v1/account/push-subscriptions/route";
const request = (body: unknown, origin = "https://glohaus.test") =>
  new Request("https://glohaus.test/api/v1/account/notification-settings", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.role = "customer";
  mocks.query.mockResolvedValue({
    rows: [{ data: { preferences: [], devices: [] }, id: "device" }],
  });
  vi.stubEnv("VAPID_PUBLIC_KEY", "public-test-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-test-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.test");
});
it("requires a customer account and never returns a private configuration value", async () => {
  const r = await GET();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  const text = await r.text();
  expect(text).toContain("public-test-key");
  expect(text).not.toContain("private-test-key");
  mocks.allowed = false;
  expect((await GET()).status).toBe(401);
  expect(
    (await PATCH(request({ category: "messages", push: true }))).status,
  ).toBe(401);
  mocks.allowed = true;
  mocks.role = "professional";
  expect((await GET()).status).toBe(403);
});
it("changes only the selected push category and rejects email or role injection", async () => {
  expect(
    (await PATCH(request({ category: "messages", push: true }))).status,
  ).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.set_customer_push_preference($1,$2)",
    ["messages", true],
  );
  for (const body of [
    { category: "messages", push: true, email: false },
    { category: "promotions", push: true },
    { category: "messages", push: true, userId: "someone-else" },
  ])
    expect((await PATCH(request(body))).status).toBe(400);
});
it("rejects cross-origin preference and device writes", async () => {
  expect(
    (
      await PATCH(
        request({ category: "messages", push: true }, "https://attacker.test"),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await POST(
        request(
          { id: "00000000-0000-4000-8000-000000000001", action: "test" },
          "https://attacker.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects arbitrary outbound push endpoints before calling the database", async () => {
  const r = await POST(
    request({
      endpoint: "https://attacker.test/",
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
      label: "Phone",
    }),
  );
  expect(r.status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("reuses the existing worker for explicit device tests and accepts disable while unconfigured", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  expect((await POST(request({ id, action: "test" }))).status).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.customer_push_action($1,$2)",
    [id, "test"],
  );
  expect(mocks.schedule).toHaveBeenCalledOnce();
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  expect((await POST(request({ id, action: "test" }))).status).toBe(503);
  expect((await POST(request({ id, action: "disable" }))).status).toBe(200);
});

import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/modules/notifications/schedule",()=>({scheduleNotificationDelivery:vi.fn()}));
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  admin: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  withIdentity: (_id: string, work: (db: object) => unknown) => work({}),
}));
vi.mock("@/modules/admin/repository", () => ({ withAdmin: mocks.admin }));
vi.mock("@/modules/support/repository", () => ({
  createSupportRequest: mocks.create,
  setSupportStatus: mocks.status,
}));
import { POST } from "@/app/api/v1/support/route";
import { PATCH } from "@/app/api/v1/admin/support/[id]/route";
import { AccessError } from "@/modules/accounts/domain";
const body = {
  name: "Test Customer",
  email: "customer@example.test",
  topic: "Account & sign-in",
  reference: "",
  message: "A fictional support request for an isolated test.",
  website: "",
};
const request = (value: unknown = body, origin = "https://www.glohaus.shop") =>
  new Request("https://www.glohaus.shop/api/v1/support", {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      "x-vercel-forwarded-for": "192.0.2.1",
    },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue("11111111-1111-4111-8111-111111111111");
  mocks.admin.mockImplementation((work: (db: object) => unknown) => work({}));
  mocks.status.mockResolvedValue(undefined);
});
it("accepts guest requests without exposing the network address", async () => {
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect((await response.json()).id).toBe(
    "11111111-1111-4111-8111-111111111111",
  );
  expect(mocks.create.mock.calls[0][2]).toMatch(/^[a-f0-9]{64}$/);
  expect(mocks.create.mock.calls[0][2]).not.toContain("192.0.2.1");
});
it.each([
  { ...body, message: "short" },
  { ...body, email: "invalid" },
  { ...body, website: "spam.example.test" },
])("rejects invalid or honeypot submissions", async (input) => {
  expect((await POST(request(input))).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects cross-origin requests before writing", async () => {
  expect((await POST(request(body, "https://elsewhere.example"))).status).toBe(
    403,
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
it("returns a distinct rate-limit response", async () => {
  mocks.create.mockRejectedValue(new Error("SUPPORT_RATE_LIMIT"));
  expect((await POST(request())).status).toBe(429);
});
it("does not claim delivery when storage fails", async () => {
  mocks.create.mockRejectedValue(new AccessError("UNAVAILABLE", 503));
  expect((await POST(request())).status).toBe(503);
});
it("requires verified staff access for status changes", async () => {
  mocks.admin.mockRejectedValue(new AccessError("FORBIDDEN", 403));
  const response = await PATCH(request({ status: "resolved" }), {
    params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
  });
  expect(response.status).toBe(403);
  expect(mocks.status).not.toHaveBeenCalled();
});

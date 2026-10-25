import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  query: vi.fn(),
  get: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@/modules/admin/repository", () => ({ withOwner: mocks.owner }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/modules/support-mail/worker", () => ({
  deliverSupportForwarding: vi.fn(),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { receiving: { get: mocks.get } };
  },
}));
import { GET, POST } from "@/app/api/v1/admin/support/mail/route";
import { AccessError } from "@/modules/accounts/domain";
const id = "11111111-1111-4111-8111-111111111111";
function request(origin = "https://www.glohaus.shop") {
  return new Request("https://www.glohaus.shop/api/v1/admin/support/mail", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ emailId: id }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "fixture-only");
  vi.stubEnv("SUPPORT_EMAIL_FORWARDING_ENABLED", "true");
  mocks.owner.mockImplementation((work) => work({ query: mocks.query }));
  mocks.query.mockResolvedValue({
    rows: [{ data: { counts: {}, items: [] } }],
  });
  mocks.get.mockResolvedValue({
    data: {
      from: "customer@example.test",
      to: ["support@glohaus.shop"],
      authentication: { dmarc: "pass" },
      raw: { download_url: "https://cdn.resend.app/fixture" },
    },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
it("requires Owner MFA before reading provider messages or queueing", async () => {
  mocks.owner.mockRejectedValue(new AccessError("FORBIDDEN", 403));
  expect((await GET(new Request(request().url))).status).toBe(403);
  expect((await POST(request())).status).toBe(403);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects cross-origin writes and keeps status responses private", async () => {
  expect((await POST(request("https://attacker.example.test"))).status).toBe(
    403,
  );
  expect(mocks.get).not.toHaveBeenCalled();
  const response = await GET(new Request(request().url));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("reports queued, not delivered, and leaves duplicates to the durable queue", async () => {
  const response = await POST(request());
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ queued: true });
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.owner_queue_support_mail($1)",
    [id],
  );
  expect(mocks.after).toHaveBeenCalledOnce();
});
it("holds unsafe senders for private review without queueing", async () => {
  mocks.get.mockResolvedValue({
    data: {
      from: "customer@example.test",
      to: ["support@glohaus.shop"],
      authentication: { dmarc: "fail" },
    },
    error: null,
  });
  expect((await POST(request())).status).toBe(409);
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
});

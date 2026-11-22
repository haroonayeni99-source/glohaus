import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ account: vi.fn(), ready: vi.fn(() => true), create: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/api-account", () => ({ withAccount: m.account }));
vi.mock("@/modules/business-tools/subscription", () => ({ subscriptionReady: m.ready, createSubscription: m.create, revokeSubscription: m.revoke }));
import { POST } from "@/app/api/v1/professional/calendar-subscription/route";
import { AccessError } from "@/modules/accounts/domain";
afterEach(() => { vi.clearAllMocks(); m.ready.mockReturnValue(true); });
function request(action: string, origin = "https://www.glohaus.shop") {
  return new Request("https://www.glohaus.shop/api/v1/professional/calendar-subscription", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
}
it("rejects CSRF and invalid input before account or database access", async () => {
  expect((await POST(request("revoke", "https://attacker.example"))).status).toBe(403);
  expect((await POST(request("unknown"))).status).toBe(400);
  expect(m.account).not.toHaveBeenCalled();
});
it("keeps disabled schema unreachable", async () => {
  m.ready.mockReturnValue(false);
  expect((await POST(request("regenerate"))).status).toBe(409);
  expect(m.account).not.toHaveBeenCalled();
});
it("requires authenticated professional access", async () => {
  m.account.mockRejectedValueOnce(new AccessError("UNAUTHENTICATED", 401));
  expect((await POST(request("regenerate"))).status).toBe(401);
  expect(m.create).not.toHaveBeenCalled();
  expect(m.account).toHaveBeenCalledWith("professional", expect.any(Function));
});
it("takes the professional identity from the authenticated account for issue and revoke", async () => {
  const db = { query: vi.fn() };
  m.account.mockImplementation((_role, work) => work(db, { authId: "owner", professionalId: "professional" }));
  m.create.mockResolvedValue("https://www.glohaus.shop/api/calendar/subscription/fixture");
  const response = await POST(request("regenerate"));
  expect(await response.json()).toEqual({ url: "https://www.glohaus.shop/api/calendar/subscription/fixture" });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(m.create).toHaveBeenCalledWith(db, "owner", "professional");
  expect((await POST(request("revoke"))).status).toBe(200);
  expect(m.revoke).toHaveBeenCalledWith(db, "professional");
});

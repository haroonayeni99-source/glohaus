import { beforeEach, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/v1/professional/seller-settings/route";
import { AccessError } from "@/modules/accounts/domain";
const mocks = vi.hoisted(() => ({
  withAccount: vi.fn(),
  save: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/api-account", () => ({ withAccount: mocks.withAccount }));
vi.mock("@/modules/shop/seller-repository", () => ({
  saveSellerSettings: mocks.save,
  sellerSettings: mocks.read,
}));
const settings = { away: true, awayUntil: null };
function request(body: unknown = settings, origin = "https://glohaus.test") {
  return new Request(
    "https://glohaus.test/api/v1/professional/seller-settings",
    {
      method: "PUT",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.withAccount.mockImplementation(async (_role, work) =>
    work({}, { professionalId: "server-owned-professional" }),
  );
  mocks.save.mockResolvedValue(settings);
  mocks.read.mockResolvedValue(settings);
});
it("saves only the authenticated professional's settings", async () => {
  const response = await PUT(request());
  expect(response.status).toBe(200);
  expect(mocks.withAccount).toHaveBeenCalledWith(
    "professional",
    expect.any(Function),
  );
  expect(mocks.save).toHaveBeenCalledWith(
    {},
    "server-owned-professional",
    settings,
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("rejects forged identity fields before a database write", async () => {
  expect(
    (await PUT(request({ ...settings, professionalId: "someone-else" })))
      .status,
  ).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects cross-origin changes", async () => {
  expect((await PUT(request(settings, "https://untrusted.test"))).status).toBe(
    403,
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects oversized request bodies", async () => {
  expect(
    (await PUT(request({ ...settings, extra: "a".repeat(3000) }))).status,
  ).toBe(413);
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each([401, 403])("preserves account access denial %i", async (status) => {
  mocks.withAccount.mockRejectedValue(
    new AccessError(status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", status),
  );
  expect((await PUT(request())).status).toBe(status);
  expect((await GET()).status).toBe(status);
});
it("reads private settings without caching", async () => {
  const response = await GET();
  expect(await response.json()).toEqual({ settings });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

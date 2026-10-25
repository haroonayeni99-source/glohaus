import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
const m = vi.hoisted(() => ({
  owner: vi.fn(),
  query: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/modules/admin/repository", () => ({ withOwner: m.owner }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { GET, POST } from "@/app/api/v1/admin/service-safeguards/route";
const ids = {
  professionalId: "11111111-1111-4111-8111-111111111111",
  categoryId: "22222222-2222-4222-8222-222222222222",
};
const input = {
  ...ids,
  status: "approved",
  registrationReference: "123456",
  validUntil: "2027-01-01",
  registerChecked: true,
  insuranceChecked: true,
  safeguardsChecked: true,
  dentistConfirmed: true,
  reason: "Verified fictional evidence references.",
};
const request = (body: unknown = input, origin = "https://glohaus.test") =>
  new Request("https://glohaus.test/api/v1/admin/service-safeguards", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.query.mockResolvedValue({
    rows: [{ data: { categories: [], approvals: [] } }],
  });
  m.owner.mockImplementation((work) => work({ query: m.query }));
});
afterEach(() => vi.restoreAllMocks());
it.each([401, 403])(
  "denies unauthorized and non-Owner access (%s)",
  async (status) => {
    m.owner.mockRejectedValue(new AccessError("FORBIDDEN", status));
    expect((await GET()).status).toBe(status);
    expect((await POST(request())).status).toBe(status);
    expect(m.query).not.toHaveBeenCalled();
  },
);
it("rejects cross-origin and incomplete approval requests before changing anything", async () => {
  expect((await POST(request(input, "https://evil.test"))).status).toBe(403);
  for (const field of [
    "registerChecked",
    "insuranceChecked",
    "safeguardsChecked",
  ])
    expect((await POST(request({ ...input, [field]: false }))).status).toBe(
      400,
    );
  expect((await POST(request({ ...input, pricingRate: 2 }))).status).toBe(400);
  expect(m.owner).not.toHaveBeenCalled();
});
it("uses only the existing Owner routine and returns uncached private review data", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(m.query).toHaveBeenCalledWith(
    "SELECT beauty.owner_regulatory_overview() AS data",
  );
});
it("saves provider evidence without activating a category and revokes with a reason alone", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(m.query.mock.calls[0][0]).toBe(
    "SELECT beauty.owner_set_regulatory_clearance($1::jsonb)",
  );
  expect(JSON.parse(m.query.mock.calls[0][1][0])).toEqual(input);
  expect(
    (
      await POST(
        request({
          ...ids,
          status: "revoked",
          reason: "Registration is no longer current.",
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    m.query.mock.calls.every(([sql]) => !sql.includes("admin_update_taxonomy")),
  ).toBe(true);
});
it("reports a saved decision accurately when cache refresh fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.revalidate.mockImplementation(() => {
    throw Error("cache unavailable");
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ saved: true, refreshPending: true });
  expect(m.query).toHaveBeenCalledOnce();
});

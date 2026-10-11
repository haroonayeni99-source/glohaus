import { beforeEach, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  denied: false,
  save: vi.fn(),
  own: vi.fn(),
  nearby: vi.fn(),
}));
vi.mock("@/lib/api-account", () => ({
  withAccount: async (
    role: string,
    work: (db: object, account: object) => unknown,
  ) => {
    if (mocks.denied) throw new AccessError("FORBIDDEN", 403);
    return work({ query: mocks.query }, { professionalId: "owned-pro" });
  },
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async (id: string, work: (db: object) => unknown) => {
    expect(id).toBe("");
    return work({ query: mocks.query });
  },
}));
vi.mock("@/modules/professionals/location-repository", () => ({
  savePublicLocation: mocks.save,
  ownPublicLocation: mocks.own,
}));
vi.mock("@/modules/professionals/repository", () => ({
  publicProfessionals: mocks.nearby,
}));
import { GET, PUT } from "@/app/api/v1/professional/profile/location/route";
import { POST } from "@/app/api/v1/explore/nearby/route";
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";
function request(body: unknown, origin = "https://glohaus.test") {
  return new Request("https://glohaus.test/api/v1/explore/nearby", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied = false;
  mocks.own.mockResolvedValue(null);
  mocks.nearby.mockResolvedValue([]);
});
it("saves only the signed-in professional's consented point and blocks forged ownership", async () => {
  const input = {
    latitude: 51.5,
    longitude: -0.12,
    source: "pin",
    confirmed: true,
  };
  expect((await PUT(request(input))).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(
    expect.anything(),
    "owned-pro",
    input,
  );
  expect(
    (await PUT(request({ ...input, professionalId: "victim" }))).status,
  ).toBe(400);
  expect((await PUT(request(input, "https://evil.test"))).status).toBe(403);
  mocks.denied = true;
  expect((await GET()).status).toBe(403);
});
it("keeps read and removal responses private and uncached", async () => {
  const response = await GET();
  expect(await response.json()).toEqual({ location: null });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await PUT(request({ confirmed: false }))).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(expect.anything(), "owned-pro", {
    confirmed: false,
  });
});
it("accepts bounded transient coordinates via POST and returns closest 100 only", async () => {
  mocks.nearby.mockResolvedValue(
    Array.from({ length: 101 }, (_, id) => ({ id })),
  );
  const body = {
    latitude: 51.5,
    longitude: -0.12,
    radiusMiles: 10,
    query: "Hair",
    filters: defaultDiscoveryFilters,
  };
  const response = await POST(request(body));
  const result = await response.json();
  expect(result.professionals).toHaveLength(100);
  expect(result.truncated).toBe(true);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.nearby).toHaveBeenCalledWith(
    expect.anything(),
    "Hair",
    undefined,
    defaultDiscoveryFilters,
    body,
  );
});
it.each([
  { latitude: 100 },
  { longitude: 181 },
  { radiusMiles: 101 },
  { radiusMiles: 0 },
  { latitude: "51.5" },
  { userId: "forged" },
])("rejects malformed nearby input %j before SQL", async (patch) => {
  expect(
    (
      await POST(
        request({
          latitude: 51.5,
          longitude: -0.12,
          radiusMiles: 10,
          query: "",
          filters: defaultDiscoveryFilters,
          ...patch,
        }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.nearby).not.toHaveBeenCalled();
});
it("rejects cross-origin coordinates and preserves database failures as unavailable", async () => {
  const body = {
    latitude: 51.5,
    longitude: -0.12,
    radiusMiles: 10,
    query: "",
    filters: defaultDiscoveryFilters,
  };
  expect((await POST(request(body, "https://evil.test"))).status).toBe(403);
  mocks.nearby.mockRejectedValue(new Error("database offline"));
  expect((await POST(request(body))).status).toBe(503);
});

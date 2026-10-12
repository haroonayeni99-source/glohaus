import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/admin/homepage-media/categories/route";
import { AccessError } from "@/modules/accounts/domain";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), query: vi.fn() }));
vi.mock("@/modules/admin/repository", () => ({ withOwner: mocks.owner }));
const images = {
  desktop: { nails: "https://images.example.test/nails.webp" },
  mobile: {},
};
function request(
  body: unknown = { images, reason: "New nail close-up" },
  origin = "https://glohaus.test",
) {
  return new Request(
    "https://glohaus.test/api/v1/admin/homepage-media/categories",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue({ rows: [{ data: images }] });
  mocks.owner.mockImplementation((work) => work({ query: mocks.query }));
});
it("saves only category media through the Owner routine and preserves the two device maps", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ images });
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.owner_set_homepage_category_images($1::jsonb,$2) AS data",
    [JSON.stringify(images), "New nail close-up"],
  );
});
it.each([401, 403])("blocks unauthorized saves (%s)", async (status) => {
  mocks.owner.mockRejectedValue(
    new AccessError(
      status === 401 ? "UNAUTHENTICATED" : "MFA_REQUIRED",
      status,
    ),
  );
  expect((await POST(request())).status).toBe(status);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("blocks cross-origin saves before touching the database", async () => {
  expect(
    (await POST(request(undefined, "https://untrusted.test"))).status,
  ).toBe(403);
  expect(mocks.owner).not.toHaveBeenCalled();
});
it.each([
  { desktop: { nails: "http://images.example.test/a.webp" }, mobile: {} },
  { desktop: { nails: "javascript:alert(1)" }, mobile: {} },
  {
    desktop: { nails: "https://images.example.test/" + "a".repeat(2048) },
    mobile: {},
  },
  { desktop: { unknown: "https://images.example.test/a.webp" }, mobile: {} },
  { desktop: {}, mobile: { barber: "https://images.example.test/a.webp" } },
  { desktop: {}, mobile: {}, tablet: {} },
  { desktop: { nails: false }, mobile: {} },
])("rejects invalid media without saving: %j", async (images) => {
  expect(
    (await POST(request({ images, reason: "Check validation" }))).status,
  ).toBe(400);
  expect(mocks.owner).not.toHaveBeenCalled();
});
it("supports clearing an individual image and rejects a missing audit reason", async () => {
  expect(
    (
      await POST(
        request({
          images: { desktop: { nails: null }, mobile: {} },
          reason: "Restore nails default",
        }),
      )
    ).status,
  ).toBe(200);
  mocks.owner.mockClear();
  expect((await POST(request({ images, reason: "" }))).status).toBe(400);
  expect(mocks.owner).not.toHaveBeenCalled();
});

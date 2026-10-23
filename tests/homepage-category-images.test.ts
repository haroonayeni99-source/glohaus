import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/admin/homepage-media/categories/route";
import { AccessError } from "@/modules/accounts/domain";
import { homepageCategorySlots, homepageCategoryHref } from "@/modules/platform/homepage-images";
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
it("saves names and photos atomically through the verified Owner routine", async () => {
  const names = {
    desktop: { nails: "  Nail art & care  " },
    mobile: { nails: "Gel nails" },
  };
  expect(
    (
      await POST(
        request({ images, names, reason: "Rename homepage shortcuts" }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.owner_set_homepage_categories($1::jsonb,$2::jsonb,$3) AS data",
    [
      JSON.stringify(images),
      JSON.stringify({
        desktop: { nails: "Nail art & care" },
        mobile: names.mobile,
      }),
      "Rename homepage shortcuts",
    ],
  );
});
it.each([
  { desktop: { nails: " " }, mobile: {} },
  { desktop: { nails: "x" }, mobile: {} },
  { desktop: { nails: "x".repeat(61) }, mobile: {} },
  { desktop: { unknown: "Beauty" }, mobile: {} },
  { desktop: {}, mobile: { barber: "Beauty" } },
  { desktop: {}, mobile: {}, tablet: {} },
  { desktop: { nails: false }, mobile: {} },
])(
  "rejects invalid names before entering the Owner transaction: %j",
  async (names) => {
    expect(
      (
        await POST(
          request({ images, names, reason: "Rename homepage shortcuts" }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.owner).not.toHaveBeenCalled();
  },
);

it("includes newly added mobile thumbnail categories in the selected order and hides disabled shortcuts", () => {
  const first = "11111111-1111-4111-8111-111111111111";
  const hidden = "22222222-2222-4222-8222-222222222222";
  const categories = homepageCategorySlots({
    categoryNames: { mobile: { [first]: "Brows", [hidden]: "Hidden" } },
    categoryImages: { mobile: { [first]: "https://example.com/brows.webp" } },
    categoryMetadata: { mobile: {
      [first]: { categoryId: null, specialityId: null, templateId: null, description: "", sortOrder: 5, visible: true },
      [hidden]: { categoryId: null, specialityId: null, templateId: null, description: "", sortOrder: 4, visible: false },
    } },
  }, "mobile");
  expect(categories.map(c => c.key)).toContain(first);
  expect(categories.map(c => c.key)).not.toContain(hidden);
  expect(categories[0].key).toBe("hair");
  expect(categories[1].key).toBe(first);
});
it("uses an Owner-selected catalogue category for new mobile homepage thumbnails", () => {
  const key = "33333333-3333-4333-8333-333333333333";
  const categoryId = "44444444-4444-4444-8444-444444444444";
  const media = {
    desktopHero: null, mobileHero: null,
    categoryMetadata: { mobile: { [key]: {
      categoryId, specialityId: null, templateId: null, description: "", sortOrder: 100, visible: true,
    } } },
  };
  expect(homepageCategoryHref(media, "mobile", key, "Brows")).toBe(`/explore?categoryId=${categoryId}`);
});

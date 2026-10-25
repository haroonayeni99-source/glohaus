import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), admin: vi.fn() }));
vi.mock("@/modules/admin/repository", () => ({ withAdmin: mocks.admin }));
import { PATCH } from "@/app/api/v1/admin/support/[id]/route";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockImplementation((work) => work({ query: mocks.query }));
  mocks.query.mockResolvedValue({ rows: [] });
});
const request = (note: string) =>
  new Request(`https://www.glohaus.shop/api/v1/admin/support/${id}`, {
    method: "PATCH",
    headers: {
      origin: "https://www.glohaus.shop",
      "content-type": "application/json",
    },
    body: JSON.stringify({ note, status: "under_review", public: true }),
  });
it.each(["a".repeat(4000), "美".repeat(4000), '"'.repeat(4000)])(
  "accepts the full permitted reply including UTF-8 and JSON escaping",
  async (note) => {
    expect(
      (await PATCH(request(note), { params: Promise.resolve({ id }) })).status,
    ).toBe(200);
    expect(mocks.query.mock.calls[0][1][2]).toBe(note);
  },
);
it("still rejects overlong replies and oversized bodies before writing", async () => {
  expect(
    (
      await PATCH(request("a".repeat(4001)), {
        params: Promise.resolve({ id }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await PATCH(request("a".repeat(40000)), {
        params: Promise.resolve({ id }),
      })
    ).status,
  ).toBe(413);
  expect(mocks.query).not.toHaveBeenCalled();
});

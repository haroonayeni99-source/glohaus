import { beforeEach, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
import { PUT } from "@/app/api/v1/admin/profile-examples/route";
const state = vi.hoisted(() => ({ owner: true, query: vi.fn() }));
vi.mock("@/modules/admin/repository", () => ({
  withOwner: async (work: (db: { query: typeof state.query }) => unknown) => {
    if (!state.owner) throw new AccessError("FORBIDDEN", 403);
    return work({ query: state.query });
  },
}));
beforeEach(() => {
  state.owner = true;
  state.query.mockReset().mockResolvedValue({ rows: [] });
});
const req = (body: unknown, origin = "https://www.glohaus.shop") =>
  new Request("https://www.glohaus.shop/api/v1/admin/profile-examples", {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
it("persists an Owner choice using the protected routine, with no-store responses", async () => {
  const r = await PUT(
    req({ enabled: true, hiddenSlugs: ["gloss-house", "gloss-house"] }),
  );
  expect(r.status).toBe(200);
  expect(state.query).toHaveBeenCalledWith(
    "SELECT beauty.owner_set_profile_examples($1,$2::text[])",
    [true, ["gloss-house"]],
  );
  expect(r.headers.get("cache-control")).toContain("no-store");
});
it("rejects non-owners before a settings write", async () => {
  state.owner = false;
  expect((await PUT(req({ enabled: false, hiddenSlugs: [] }))).status).toBe(
    403,
  );
  expect(state.query).not.toHaveBeenCalled();
});
it("rejects cross-origin requests and unknown example slugs", async () => {
  expect(
    (
      await PUT(
        req({ enabled: false, hiddenSlugs: [] }, "https://evil.example"),
      )
    ).status,
  ).toBe(403);
  expect(
    (await PUT(req({ enabled: true, hiddenSlugs: ["not-real"] }))).status,
  ).toBe(400);
  expect(state.query).not.toHaveBeenCalled();
});
it("reports failed saves instead of claiming success", async () => {
  state.query.mockRejectedValue(new Error("unavailable"));
  expect((await PUT(req({ enabled: false, hiddenSlugs: [] }))).status).toBe(
    503,
  );
});

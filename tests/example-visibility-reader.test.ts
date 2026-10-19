import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({
  withIdentity: async (
    _id: string,
    work: (db: { query: typeof state.query }) => unknown,
  ) => work({ query: state.query }),
}));
import { publicExampleVisibility } from "@/modules/professionals/example-visibility-repository";
afterEach(() => {
  vi.unstubAllEnvs();
  state.query.mockReset();
});
it("honours hidden settings on configured deployments", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://isolated.invalid/db");
  state.query.mockResolvedValue({
    rows: [{ value: { enabled: false, hiddenSlugs: ["gloss-house"] } }],
  });
  expect(await publicExampleVisibility()).toEqual({
    enabled: false,
    hiddenSlugs: ["gloss-house"],
  });
});
it("hides examples during database or malformed-setting failures", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://isolated.invalid/db");
  state.query
    .mockRejectedValueOnce(Error("database unavailable"))
    .mockResolvedValueOnce({ rows: [{ value: { enabled: "bad" } }] });
  expect((await publicExampleVisibility()).enabled).toBe(false);
  expect((await publicExampleVisibility()).enabled).toBe(false);
});

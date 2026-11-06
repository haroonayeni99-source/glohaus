import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  query: vi.fn(async () => ({ rows: [] })),
  db: vi.fn(),
}));
vi.mock("@/modules/business-tools/worker", () => ({
  refreshServiceCalendars: m.refresh,
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async (
    _id: string,
    work: (db: { query: typeof m.query }) => unknown,
  ) => {
    m.db();
    return work({ query: m.query });
  },
}));
import { GET } from "@/app/api/v1/availability/route";
afterEach(() => vi.clearAllMocks());
const request = (date: string) =>
  new Request(
    "https://www.glohaus.shop/api/v1/availability?serviceId=00000000-0000-4000-8000-000000000001&date=" +
      encodeURIComponent(date),
  );
it("rejects impossible dates before database or external calendar work", async () => {
  for (const date of [
    "2026-02-30",
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-11-00",
    "junk",
  ]) {
    const r = await GET(request(date));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: { code: "INVALID_REQUEST" } });
  }
  expect(m.refresh).not.toHaveBeenCalled();
  expect(m.db).not.toHaveBeenCalled();
});
it("accepts genuine leap dates and preserves the London timezone response", async () => {
  const r = await GET(request("2028-02-29"));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ slots: [], timezone: "Europe/London" });
  expect(m.refresh).toHaveBeenCalledOnce();
});

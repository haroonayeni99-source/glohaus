import { describe, it, expect } from "vitest";
import {
  ActiveClock,
  analyticsPage,
  engagementReport,
  reportingRange,
  scrollPercent,
  snapshotSchema,
  type Observation,
} from "@/modules/website-analytics/domain";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (
  n: number,
  page: Observation["page"],
  extra: Partial<Observation> = {},
): Observation => ({
  id: uuid(n),
  visitor: uuid(2),
  session: uuid(3),
  page,
  device: "mobile",
  sequence: 1,
  activeMs: 1000,
  scroll: 25,
  clicks: {},
  videos: [],
  firstAt: new Date(2026, 10, 6, 0, n).toISOString(),
  lastAt: new Date(2026, 10, 6, 0, n).toISOString(),
  ...extra,
});
describe("privacy and engagement measurement", () => {
  it("categorises actual routes without leaking identifiers or query strings", () => {
    expect(analyticsPage("/p/test/services/a")).toBe("service");
    expect(analyticsPage("/p/test")).toBe("profile");
    expect(analyticsPage("/account/bookings/id")).toBe("booking");
    for (const p of [
      "/admin",
      "/professional",
      "/messages",
      "/account",
      "/security",
      "/sign-in",
      "/api/v1/cart",
      "/p/abc?email=private",
    ])
      expect(analyticsPage(p)).toBeNull();
  });
  it("excludes hidden, unfocused, idle and suspended-device time", () => {
    const c = new ActiveClock(0);
    expect(c.tick(1000, true, true)).toBe(1000);
    expect(c.tick(2000, false, true)).toBe(1000);
    expect(c.tick(3000, true, false)).toBe(1000);
    expect(c.tick(40000, true, true)).toBe(1000);
    c.touch(40000);
    expect(c.tick(41000, true, true)).toBe(2000);
    c.touch(999999);
    expect(c.tick(999999, true, true)).toBe(4000);
  });
  it("rejects arbitrary text, unknown fields and invalid counters", () => {
    const valid = row(1, "home");
    const { firstAt, lastAt, ...payload } = valid;
    void firstAt;
    void lastAt;
    expect(snapshotSchema.safeParse(payload).success).toBe(true);
    for (const added of [
      { url: "https://private" },
      { email: "private" },
      { clicks: { message: "private" } },
      { activeMs: -1 },
      { videos: [{ src: "https://private" }] },
    ])
      expect(snapshotSchema.safeParse({ ...payload, ...added }).success).toBe(
        false,
      );
  });
  it("calculates mean and median separately, with deduplicated visitors and sessions", () => {
    const r = engagementReport([
      row(1, "home", { activeMs: 1000 }),
      row(2, "home", { activeMs: 2000 }),
      row(3, "home", { activeMs: 9000 }),
    ]);
    expect(r.views).toBe(3);
    expect(r.visitors).toBe(1);
    expect(r.sessions).toBe(1);
    expect(r.byPage[0].averageMs).toBe(4000);
    expect(r.byPage[0].medianMs).toBe(2000);
    expect(r.averageSessionMs).toBe(12000);
  });
  it("requires ordered funnel steps and server conversion evidence", () => {
    let r = engagementReport([
      row(1, "profile"),
      row(2, "service", { conversion: "booking" }),
      row(3, "booking"),
    ]);
    expect(r.bookingFunnel.map((x) => x.count)).toEqual([1, 1, 1]);
    r = engagementReport([
      row(1, "service"),
      row(2, "profile"),
      row(3, "booking"),
    ]);
    expect(r.bookingFunnel.map((x) => x.count)).toEqual([1, 0, 0]);
  });
  it("suppresses rare journey patterns", () => {
    const r = engagementReport([row(1, "home"), row(2, "shop")]);
    expect(r.journeys).toEqual([]);
  });
  it("flags meaningful high-engagement low-conversion samples only", () => {
    let r = engagementReport(
      Array.from({ length: 20 }, (_, i) =>
        row(i, "home", { session: uuid(i + 10), activeMs: 65000 }),
      ),
    );
    expect(r.byPage[0].investigate).toBe(true);
    r = engagementReport([row(1, "home", { activeMs: 65000 })]);
    expect(r.byPage[0].investigate).toBe(false);
  });
  it("clamps scroll and validates real custom dates", () => {
    expect(scrollPercent(100, 200, 100)).toBe(100);
    expect(scrollPercent(-20, 200, 100)).toBe(0);
    expect(scrollPercent(0, 100, 200)).toBe(100);
    expect(() =>
      reportingRange({
        period: "custom",
        from: "2026-02-30",
        to: "2026-11-06",
      }),
    ).toThrow();
    expect(() =>
      reportingRange({
        period: "custom",
        from: "2026-11-06",
        to: "2026-11-01",
      }),
    ).toThrow();
    expect(
      reportingRange({ period: "week" }, new Date("2026-11-06T12:00:00Z")).from,
    ).toBe("2026-10-31T00:00:00.000Z");
  });
});

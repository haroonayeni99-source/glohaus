import { z } from "zod";
export const pages = [
  "home",
  "discover",
  "shop",
  "product",
  "profile",
  "service",
  "registration",
  "booking",
  "checkout",
] as const;
export type Page = (typeof pages)[number];
export const pageLabels: Record<Page, string> = {
  home: "Home",
  discover: "Discover",
  shop: "Shop",
  product: "Product",
  profile: "Professional profiles",
  service: "Service selection",
  registration: "Registration",
  booking: "Booking",
  checkout: "Checkout",
};
export function analyticsPage(path: string): Page | null {
  if (path.includes("?") || path.includes("#")) return null;
  if (path === "/") return "home";
  if (path === "/discover") return "discover";
  if (path === "/shop") return "shop";
  if (/^\/shop\/products\/[^/]+$/.test(path)) return "product";
  if (/^\/p\/[^/]+$/.test(path)) return "profile";
  if (/^\/p\/[^/]+\/services\/[^/]+$/.test(path)) return "service";
  if (path === "/sign-up" || path === "/onboarding") return "registration";
  if (/^\/account\/bookings\/[^/]+$/.test(path)) return "booking";
  if (path === "/cart" || path === "/shop/checkout") return "checkout";
  return null;
}
export const actions = [
  "home",
  "discover",
  "shop",
  "profile",
  "service",
  "registration",
  "booking",
  "checkout",
  "search",
  "filter",
  "video_play",
  "video_pause",
  "video_sound",
  "add_to_cart",
] as const;
export const snapshotSchema = z
  .object({
    id: z.uuid(),
    visitor: z.uuid(),
    session: z.uuid(),
    page: z.enum(pages),
    device: z.enum(["mobile", "tablet", "desktop"]),
    sequence: z.number().int().min(1).max(10000),
    activeMs: z.number().int().min(0).max(14400000),
    scroll: z.number().int().min(0).max(100),
    clicks: z.partialRecord(z.enum(actions), z.number().int().min(0).max(1000)),
    videos: z
      .array(
        z
          .object({
            id: z.uuid(),
            impressions: z.number().int().min(0).max(1),
            watchMs: z.number().int().min(0).max(14400000),
            starts: z.number().int().min(0).max(1000),
            completions: z.number().int().min(0).max(1000),
            replays: z.number().int().min(0).max(1000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export class ActiveClock {
  private last: number;
  private interaction: number;
  private total = 0;
  constructor(now: number) {
    this.last = now;
    this.interaction = now;
  }
  tick(now: number, visible: boolean, focused: boolean) {
    // A delayed timer/suspended device cannot manufacture engagement.
    const delta = Math.max(0, Math.min(now - this.last, 2000));
    if (visible && focused && now - this.interaction <= 30000)
      this.total += delta;
    this.last = now;
    return Math.round(this.total);
  }
  touch(now: number) {
    this.interaction = now;
  }
}
export function scrollPercent(top: number, height: number, viewport: number) {
  return height <= viewport
    ? 100
    : Math.round(Math.min(100, Math.max(0, (top / (height - viewport)) * 100)));
}
export type Observation = Snapshot & {
  firstAt: string;
  lastAt: string;
  conversion?: "booking" | "purchase" | null;
};
const mean = (n: number[]) =>
  n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0;
const median = (n: number[]) => {
  const a = [...n].sort((a, b) => a - b);
  return a.length
    ? (a[Math.floor(a.length / 2)] + a[Math.floor((a.length - 1) / 2)]) / 2
    : 0;
};
export function engagementReport(rows: Observation[]) {
  const sessions = new Map<string, Observation[]>();
  for (const r of rows) {
    const group = sessions.get(r.session) ?? [];
    group.push(r);
    sessions.set(r.session, group);
  }
  const byPage = pages.map((page) => {
    const p = rows.filter((r) => r.page === page),
      pageSessions = new Set(p.map((r) => r.session));
    const converted = [...sessions].filter(
      ([id, group]) => pageSessions.has(id) && group.some((r) => r.conversion),
    ).length;
    return {
      page,
      views: p.length,
      visitors: new Set(p.map((r) => r.visitor)).size,
      averageMs: mean(p.map((r) => r.activeMs)),
      medianMs: median(p.map((r) => r.activeMs)),
      scroll: mean(p.map((r) => r.scroll)),
      clicks: p.reduce(
        (s, r) => s + Object.values(r.clicks).reduce((a, b) => a + (b ?? 0), 0),
        0,
      ),
      converted,
      conversionRate: pageSessions.size ? converted / pageSessions.size : 0,
      investigate:
        pageSessions.size >= 20 &&
        mean(p.map((r) => r.activeMs)) >= 60000 &&
        converted / pageSessions.size < 0.02,
    };
  });
  const paths = new Map<string, number>(),
    transitions = new Map<string, number>();
  for (const group of sessions.values()) {
    group.sort((a, b) => a.firstAt.localeCompare(b.firstAt));
    const path = group
      .map((r) => r.page)
      .filter((p, i, a) => !i || p !== a[i - 1]);
    const key = path.slice(0, 8).join(" → ");
    paths.set(key, (paths.get(key) ?? 0) + 1);
    for (let i = 1; i < path.length; i++) {
      const key = `${path[i - 1]} → ${path[i]}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);
    }
  }
  function funnel(stages: Page[], conversion: "booking" | "purchase") {
    return [...stages, conversion + "_completed"].map((stage, index) => ({
      stage,
      count: [...sessions.values()].filter((group) => {
        let cursor = -1;
        for (const p of stages.slice(0, Math.min(index + 1, stages.length))) {
          cursor = group.findIndex((r, i) => i > cursor && r.page === p);
          if (cursor < 0) return false;
        }
        return (
          index < stages.length ||
          group.some((r, i) => i >= cursor && r.conversion === conversion)
        );
      }).length,
    }));
  }
  const videos = new Map<
    string,
    {
      id: string;
      impressions: number;
      watchMs: number;
      starts: number;
      completions: number;
      replays: number;
    }
  >();
  for (const r of rows.filter((r) => r.page === "discover"))
    for (const v of r.videos) {
      const old = videos.get(v.id) ?? {
        id: v.id,
        impressions: 0,
        watchMs: 0,
        starts: 0,
        completions: 0,
        replays: 0,
      };
      for (const k of [
        "impressions",
        "watchMs",
        "starts",
        "completions",
        "replays",
      ] as const)
        old[k] += v[k];
      videos.set(v.id, old);
    }
  return {
    views: rows.length,
    visitors: new Set(rows.map((r) => r.visitor)).size,
    sessions: sessions.size,
    averageSessionMs: mean(
      [...sessions.values()].map((g) => g.reduce((s, r) => s + r.activeMs, 0)),
    ),
    byPage,
    journeys: [...paths]
      .filter(([, count]) => count >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    transitions: [...transitions]
      .filter(([, count]) => count >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    bookingFunnel: funnel(["profile", "service"], "booking"),
    purchaseFunnel: funnel(["shop", "checkout"], "purchase"),
    videos: [...videos.values()],
    profileClicks: rows
      .filter((r) => r.page === "discover")
      .reduce((sum, r) => sum + (r.clicks.profile ?? 0), 0),
  };
}
export function reportingRange(
  params: { period?: string; from?: string; to?: string },
  now = new Date(),
) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  let start = new Date(end);
  start.setUTCDate(
    start.getUTCDate() -
      (params.period === "day" ? 1 : params.period === "week" ? 7 : 30),
  );
  if (params.period === "custom") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "")
    )
      throw new Error("Choose valid dates.");
    start = new Date(params.from + "T00:00:00Z");
    const to = new Date(params.to + "T00:00:00Z");
    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+to) ||
      start.toISOString().slice(0, 10) !== params.from ||
      to.toISOString().slice(0, 10) !== params.to ||
      to < start ||
      +to - +start > 92 * 86400000 ||
      to > now
    )
      throw new Error(
        "Choose dates within a maximum of 93 days, ending today or earlier.",
      );
    end.setTime(+to + 86400000);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

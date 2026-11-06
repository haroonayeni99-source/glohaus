import { afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  query: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.token ? { value: state.token } : undefined),
    set: vi.fn(),
  }),
}));
vi.mock("@/lib/db", () => ({
  withIdentity: vi.fn(
    async (_id: string, work: (db: { query: typeof state.query }) => unknown) =>
      work({ query: state.query }),
  ),
}));
import {
  engagementEnabled,
  readConsent,
  signConsent,
} from "@/modules/website-analytics/config";
import { POST } from "@/app/api/v1/engagement/events/route";
const secret = "test-only-analytics-signing-secret-123456789";
afterEach(() => {
  vi.unstubAllEnvs();
  state.token = undefined;
  vi.clearAllMocks();
});
const request = (body: unknown, origin = "https://www.glohaus.shop") =>
  new Request("https://www.glohaus.shop/api/v1/engagement/events", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
it("defaults off and refuses data collection without opening the database", async () => {
  vi.stubEnv("ENGAGEMENT_ANALYTICS_ENABLED", "");
  expect(engagementEnabled()).toBe(false);
  const r = await POST(request({}));
  expect(r.status).toBe(403);
  expect(state.query).not.toHaveBeenCalled();
});
it("verifies consent signatures, rejects tampering and expires choices", () => {
  vi.stubEnv("ENGAGEMENT_ANALYTICS_SECRET", secret);
  const now = Date.UTC(2026, 10, 6);
  const token = signConsent("accepted", now);
  expect(readConsent(token, now)).toBe("accepted");
  expect(
    readConsent(token.replace(".accepted.", ".rejected."), now),
  ).toBeNull();
  expect(readConsent(token, now + 181 * 86400000)).toBeNull();
  expect(readConsent("1.accepted.nope.signature")).toBeNull();
});
it("does not accept a consent token without a sufficiently strong server configuration", () => {
  vi.stubEnv("ENGAGEMENT_ANALYTICS_ENABLED", "true");
  vi.stubEnv("ENGAGEMENT_ANALYTICS_SECRET", "short");
  expect(engagementEnabled()).toBe(false);
});
it("requires prior opt-in and prevents cross-origin submissions", async () => {
  vi.stubEnv("ENGAGEMENT_ANALYTICS_ENABLED", "true");
  vi.stubEnv("ENGAGEMENT_ANALYTICS_SECRET", secret);
  state.token = signConsent("rejected");
  expect((await POST(request({}))).status).toBe(403);
  state.token = signConsent("accepted");
  expect((await POST(request({}, "https://attacker.example"))).status).toBe(
    403,
  );
  expect(state.query).not.toHaveBeenCalled();
});
it("rejects oversized/unknown/sensitive fields before database ingestion", async () => {
  vi.stubEnv("ENGAGEMENT_ANALYTICS_ENABLED", "true");
  vi.stubEnv("ENGAGEMENT_ANALYTICS_SECRET", secret);
  state.token = signConsent("accepted");
  expect(
    (await POST(request({ email: "private", url: "private" }))).status,
  ).toBe(400);
  expect((await POST(request({ text: "x".repeat(25000) }))).status).toBe(413);
  expect(state.query).not.toHaveBeenCalled();
});

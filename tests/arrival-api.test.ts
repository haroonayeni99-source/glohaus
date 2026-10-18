import { beforeEach, it, expect, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  action: vi.fn(),
  state: vi.fn(),
  schedule: vi.fn(),
  denied: false,
}));
vi.mock("@/lib/api-account", () => ({
  withAccount: async (_role: unknown, work: (db: unknown) => unknown) => {
    if (m.denied) throw new AccessError("FORBIDDEN", 403);
    return work({ query: m.query });
  },
}));
vi.mock("@/modules/arrival/repository", () => ({
  arrivalAction: m.action,
  arrivalState: m.state,
}));
vi.mock("@/modules/notifications/schedule", () => ({
  scheduleNotificationDelivery: m.schedule,
}));
import { GET, POST } from "@/app/api/v1/bookings/[id]/arrival/route";
const id = "11111111-1111-4111-8111-111111111111",
  context = { params: Promise.resolve({ id }) };
function request(body: unknown, origin = "https://glohaus.test") {
  return new Request(`https://glohaus.test/api/v1/bookings/${id}/arrival`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.denied = false;
  m.action.mockResolvedValue({ arrival: null });
  m.state.mockResolvedValue({ arrival: null });
  m.query.mockResolvedValue({ rows: [] });
});
it("rejects cross-origin updates and forged manual timestamps before any mutation", async () => {
  expect(
    (await POST(request({ action: "manual" }, "https://evil.test"), context))
      .status,
  ).toBe(403);
  expect(
    (await POST(request({ action: "manual", arrivalAt: "forged" }), context))
      .status,
  ).toBe(400);
  expect(m.action).not.toHaveBeenCalled();
});
it("protects state and mutations behind the existing authenticated account boundary", async () => {
  m.denied = true;
  expect((await GET(request({}), context)).status).toBe(403);
  expect((await POST(request({ action: "manual" }), context)).status).toBe(403);
  expect(m.action).not.toHaveBeenCalled();
});
it("passes only the validated booking action and returns an uncached response", async () => {
  const response = await POST(request({ action: "manual" }), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(m.action).toHaveBeenCalledWith(expect.anything(), id, {
    action: "manual",
  });
  expect(m.schedule).toHaveBeenCalledOnce();
});
it("records a shown version without claiming it was acknowledged or sending another notification", async () => {
  expect(
    (await POST(request({ action: "shown", version: 2 }), context)).status,
  ).toBe(200);
  expect(m.query).toHaveBeenCalledWith(
    "SELECT beauty.arrival_prompt_shown($1,$2)",
    [id, 2],
  );
  expect(m.schedule).not.toHaveBeenCalled();
});
it("returns actionable errors for changed location instructions", async () => {
  m.action.mockRejectedValueOnce(new Error("ARRIVAL_CHANGED"));
  const response = await POST(
    request({ action: "acknowledge", version: 1 }),
    context,
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: { code: "ARRIVAL_CHANGED" } });
});

import { beforeEach, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  allowed: true,
  role: vi.fn(),
}));
vi.mock("@/lib/api-account", () => ({
  withAccount: async (role: unknown, work: (db: object) => unknown) => {
    mocks.role(role);
    if (!mocks.allowed) throw new AccessError("UNAUTHENTICATED", 401);
    return work({ query: mocks.query });
  },
}));
import { POST as customer } from "@/app/api/v1/account/rebooking/route";
import { POST as professional } from "@/app/api/v1/professional/rebooking/route";
const id = "11111111-1111-4111-8111-111111111111";
function req(body: unknown, origin = "https://glohaus.test") {
  return new Request("https://glohaus.test/api/v1/account/rebooking", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.query.mockResolvedValue({ rows: [] });
});
it("requires authentication and same origin", async () => {
  mocks.allowed = false;
  expect(
    (
      await customer(
        req({ professionalId: id, channel: "email", enabled: true }),
      )
    ).status,
  ).toBe(401);
  mocks.allowed = true;
  expect(
    (
      await customer(
        req(
          { professionalId: id, channel: "email", enabled: true },
          "https://evil.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("never accepts another user, an unsupported channel or implied opt-in", async () => {
  for (const body of [
    { professionalId: id, channel: "sms", enabled: true },
    { professionalId: id, channel: "email", enabled: true, userId: id },
    { professionalId: id, channel: "email" },
  ])
    expect((await customer(req(body))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("persists only the authenticated user's explicit choice", async () => {
  expect(
    (
      await customer(
        req({ professionalId: id, channel: "email", enabled: false }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.set_my_rebooking_consent($1,$2,$3)",
    [id, "email", false],
  );
});
it("requires the professional role and accepts pause independently from Owner launch", async () => {
  expect(
    (await professional(req({ paused: true, delayDays: 28 }))).status,
  ).toBe(200);
  expect(mocks.role).toHaveBeenCalledWith("professional");
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.set_my_professional_rebooking($1::jsonb)",
    [JSON.stringify({ paused: true, delayDays: 28 })],
  );
});
it("allows explicit service overrides and reset, rejecting hidden identity and rule fields", async () => {
  for (const body of [
    { serviceId: id, delayDays: 14 },
    { serviceId: id, delayDays: null },
  ])
    expect((await professional(req(body))).status).toBe(200);
  mocks.query.mockClear();
  for (const body of [
    { paused: false, delayDays: 13 },
    { paused: false, delayDays: 181 },
    { paused: false, delayDays: 28, professionalId: id },
    { paused: false, delayDays: 28, enabled: true },
  ])
    expect((await professional(req(body))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});

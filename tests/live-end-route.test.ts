import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/professional/live/end/route";
import { AccessError } from "@/modules/accounts/domain";
const { query, closeRoom, withAccount } = vi.hoisted(() => ({ query: vi.fn(), closeRoom: vi.fn(), withAccount: vi.fn() }));
vi.mock("@/lib/api-account", () => ({ withAccount }));
vi.mock("@/modules/live/livekit", () => ({ closeLiveKitRoom: closeRoom }));
const id = "00000000-0000-4000-8000-000000000001";
const request = () => new Request("https://glohaus.test/api/v1/professional/live/end", { method: "POST", headers: { origin: "https://glohaus.test", "content-type": "application/json" }, body: JSON.stringify({ sessionId: id }) });
beforeEach(() => {
  vi.resetAllMocks();
  withAccount.mockImplementation(async (_role, work) => work({ query }, { professionalId: "professional-id" }));
  closeRoom.mockResolvedValue(undefined);
});
it("does not let a professional close a room they do not own", async () => {
  query.mockResolvedValue({ rows: [] });
  expect((await POST(request())).status).toBe(403);
  expect(closeRoom).not.toHaveBeenCalled();
  expect(query).toHaveBeenCalledWith(expect.stringContaining("professional_id=$2"), [id, "professional-id"]);
});
it("rejects unauthenticated requests before touching the provider", async () => {
  withAccount.mockRejectedValue(new AccessError("UNAUTHENTICATED", 401));
  expect((await POST(request())).status).toBe(401);
  expect(closeRoom).not.toHaveBeenCalled();
});
it("closes the authorized provider room and then records the ended session", async () => {
  query.mockResolvedValueOnce({ rows: [{ room_name: "owned-room" }] }).mockResolvedValueOnce({ rows: [] });
  expect((await POST(request())).status).toBe(200);
  expect(closeRoom).toHaveBeenCalledWith("owned-room");
  expect(query).toHaveBeenLastCalledWith("SELECT beauty.end_my_live_session($1)", [id]);
  expect(withAccount.mock.calls.every(([role]) => role === "professional")).toBe(true);
});

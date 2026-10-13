import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/professional/portfolio/route";
import { AccessError } from "@/modules/accounts/domain";
const mock = vi.hoisted(() => ({ account: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/api-account", () => ({ withAccount: mock.account }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  mock.query.mockResolvedValue({ rows: [] });
  mock.account.mockImplementation((_role, work) =>
    work({ query: mock.query }, { professionalId: "owner" }),
  );
});
const request = (path = "portfolio/video-owned-abcd.mp4") =>
  new Request(
    `https://glohaus.test/api/v1/professional/portfolio?path=${encodeURIComponent(path)}`,
  );
it("queries only media registered to the signed-in professional", async () => {
  mock.query.mockResolvedValue({
    rows: [{ id: "owned", media_type: "video" }],
  });
  const result = await GET(request());
  expect(result.status).toBe(200);
  expect(mock.query.mock.calls[0][0]).toContain(
    "professional_id=$1 AND blob_path=$2",
  );
  expect(mock.query.mock.calls[0][1]).toEqual([
    "owner",
    "portfolio/video-owned-abcd.mp4",
  ]);
  expect(await result.json()).toEqual({
    asset: { id: "owned", media_type: "video" },
  });
});
it("waits for the signed callback without revealing other uploads", async () => {
  expect((await GET(request())).status).toBe(202);
});
it("requires a professional session", async () => {
  mock.account.mockRejectedValue(new AccessError("UNAUTHENTICATED", 401));
  expect((await GET(request())).status).toBe(401);
  expect(mock.query).not.toHaveBeenCalled();
});
it.each([
  "https://someone.test/video.mp4",
  "portfolio/../private.mp4",
  "profile/photo.webp",
])("rejects an unrelated media path: %s", async (path) => {
  expect((await GET(request(path))).status).toBe(400);
  expect(mock.account).not.toHaveBeenCalled();
});

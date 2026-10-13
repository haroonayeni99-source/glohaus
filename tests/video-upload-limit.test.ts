import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/professional/media-upload/route";
import { VIDEO_MAX_BYTES } from "@/modules/media/limits";
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  account: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handle }));
vi.mock("@/lib/api-account", () => ({ withAccount: mocks.account }));
vi.mock("@/lib/db", () => ({ withIdentity: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "fictional-test-value");
  mocks.query.mockResolvedValue({ rows: [{ count: 0 }] });
  mocks.account.mockImplementation((_role, work) =>
    work(
      { query: mocks.query },
      { authId: "fixture", professionalId: "fixture-professional" },
    ),
  );
});
const request = () =>
  new Request("https://glohaus.test/api/v1/professional/media-upload", {
    method: "POST",
    body: "{}",
  });
it("allows 250 MB direct video uploads with the existing private owner token", async () => {
  mocks.handle.mockImplementation(async (options) => {
    const config = await options.onBeforeGenerateToken(
      "portfolio/video-fixture.mp4",
      JSON.stringify({ altText: "A finished beauty treatment" }),
    );
    expect(config.maximumSizeInBytes).toBe(VIDEO_MAX_BYTES);
    expect(config.maximumSizeInBytes).toBe(250 * 1024 * 1024);
    expect(config.allowedContentTypes).toEqual([
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]);
    expect(JSON.parse(config.tokenPayload)).toMatchObject({
      professionalId: "fixture-professional",
      authId: "fixture",
    });
    return { token: "fictional" };
  });
  expect((await POST(request())).status).toBe(200);
});
it("does not issue an upload token when the professional session is missing", async () => {
  mocks.account.mockRejectedValue(new Error("Not signed in"));
  mocks.handle.mockImplementation(async (options) =>
    options.onBeforeGenerateToken(
      "portfolio/video-fixture.mp4",
      '{"altText":"A treatment"}',
    ),
  );
  expect((await POST(request())).status).toBe(400);
});

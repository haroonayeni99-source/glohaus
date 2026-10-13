import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/media/[id]/route";
const mock = vi.hoisted(() => ({
  identity: vi.fn(),
  account: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ withIdentity: mock.identity }));
vi.mock("@/lib/api-account", () => ({ withAccount: mock.account }));
vi.mock("@vercel/blob", () => ({ get: mock.get }));
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.resetAllMocks();
  mock.identity.mockResolvedValue({
    blob_path: "portfolio/video-owned.mp4",
    mime_type: "video/mp4",
  });
  mock.get.mockResolvedValue({
    statusCode: 200,
    stream: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]));
        c.close();
      },
    }),
    headers: new Headers({ "content-length": "3" }),
  });
});
it("streams published video with byte-range support", async () => {
  mock.get.mockResolvedValue({
    statusCode: 200,
    stream: new ReadableStream({
      start(c) {
        c.close();
      },
    }),
    headers: new Headers({
      "content-range": "bytes 100-199/1000",
      "content-length": "100",
    }),
  });
  const response = await GET(
    new Request(`https://glohaus.test/api/media/${id}`, {
      headers: { range: "bytes=100-199" },
    }),
    context,
  );
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe("bytes 100-199/1000");
  expect(response.headers.get("accept-ranges")).toBe("bytes");
  expect(mock.get.mock.calls[0][1].headers).toEqual({ Range: "bytes=100-199" });
});
it("delivers ordinary video requests as a stream with the correct media type", async () => {
  const response = await GET(
    new Request(`https://glohaus.test/api/media/${id}`),
    context,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("video/mp4");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
});
it("rejects invalid or multiple ranges before accessing storage", async () => {
  expect(
    (
      await GET(
        new Request(`https://glohaus.test/api/media/${id}`, {
          headers: { range: "bytes=1-2,3-4" },
        }),
        context,
      )
    ).status,
  ).toBe(416);
  expect(mock.get).not.toHaveBeenCalled();
});
it("does not deliver another professional's private media", async () => {
  mock.identity.mockResolvedValue(undefined);
  mock.account.mockRejectedValue(new Error("Forbidden"));
  expect(
    (await GET(new Request(`https://glohaus.test/api/media/${id}`), context))
      .status,
  ).toBe(404);
  expect(mock.get).not.toHaveBeenCalled();
});

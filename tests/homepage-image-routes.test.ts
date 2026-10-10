import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/homepage-media/route";
import { POST } from "@/app/api/v1/admin/homepage-media/upload/route";
import { AccessError } from "@/modules/accounts/domain";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), media: vi.fn(), get: vi.fn(), put: vi.fn(), upload: vi.fn() }));
vi.mock("@/modules/admin/repository", () => ({ withOwner: mocks.owner }));
vi.mock("@/modules/platform/repository", () => ({ publicHomepageMedia: mocks.media }));
vi.mock("@vercel/blob", () => ({ get: mocks.get, put: mocks.put }));
vi.mock("@/modules/media/upload", () => ({ readImageUpload: mocks.upload }));
const path = "homepage/11111111-1111-4111-8111-111111111111-ab123.webp";
const imageUrl = `https://glohaus.test/api/homepage-media?image=${encodeURIComponent(path)}`;
function uploadRequest(origin = "https://glohaus.test") {
  return new Request("https://glohaus.test/api/v1/admin/homepage-media/upload", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "fictional-test-value");
  mocks.owner.mockResolvedValue(undefined);
  mocks.media.mockResolvedValue({ desktopHero: null, mobileHero: null });
  mocks.get.mockImplementation(async () => ({ statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }) }));
  mocks.upload.mockResolvedValue({ image: Buffer.from("sanitized-image"), altText: "Homepage image" });
  mocks.put.mockResolvedValue({ pathname: path });
});
it("serves only the published homepage image publicly", async () => {
  mocks.media.mockResolvedValue({ desktopHero: imageUrl, mobileHero: null });
  const response = await GET(new Request(imageUrl));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(mocks.owner).not.toHaveBeenCalled();
  expect(mocks.get).toHaveBeenCalledWith(path, expect.objectContaining({ access: "private" }));
});
it.each(["UNAUTHENTICATED", "FORBIDDEN", "MFA_REQUIRED"])("hides unpublished uploads from %s viewers", async code => {
  mocks.owner.mockRejectedValue(new AccessError(code as "FORBIDDEN", 403));
  expect((await GET(new Request(imageUrl))).status).toBe(404);
  expect(mocks.get).not.toHaveBeenCalled();
});
it("allows an authorised owner to preview an unpublished upload", async () => {
  expect((await GET(new Request(imageUrl))).status).toBe(200);
  expect(mocks.owner).toHaveBeenCalled();
});
it.each(["private/customer.webp", "homepage/../../private.webp", "homepage/arbitrary.webp"])("never proxies arbitrary private files: %s", async bad => {
  expect((await GET(new Request(`https://glohaus.test/api/homepage-media?image=${encodeURIComponent(bad)}`))).status).toBe(404);
  expect(mocks.get).not.toHaveBeenCalled();
});
it("uploads sanitized bytes privately and returns a preview URL without publishing settings", async () => {
  const response = await POST(uploadRequest());
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ url: imageUrl });
  expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^homepage\/[0-9a-f-]+\.webp$/), Buffer.from("sanitized-image"), expect.objectContaining({ access: "private", contentType: "image/webp" }));
  expect(mocks.media).not.toHaveBeenCalled();
});
it.each([401, 403])("rejects an unauthorised upload before decoding or storing (%s)", async status => {
  mocks.owner.mockRejectedValue(new AccessError(status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", status));
  expect((await POST(uploadRequest())).status).toBe(status);
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
});
it("rejects a cross-origin upload before storage", async () => {
  expect((await POST(uploadRequest("https://untrusted.test"))).status).toBe(403);
  expect(mocks.put).not.toHaveBeenCalled();
});
it("rejects invalid images and reports missing storage without touching settings", async () => {
  mocks.upload.mockRejectedValue(new AccessError("INVALID_REQUEST", 400));
  expect((await POST(uploadRequest())).status).toBe(400);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  expect((await POST(uploadRequest())).status).toBe(503);
  expect(mocks.put).not.toHaveBeenCalled();
});

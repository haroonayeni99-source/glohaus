// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContentMediaUpload } from "@/components/content-media-upload";
const mocks = vi.hoisted(() => ({
  image: vi.fn(),
  uploaded: vi.fn(),
  uploading: vi.fn(),
  video: vi.fn(),
}));
vi.mock("@/lib/image-file", () => ({ readImageFile: mocks.image }));
vi.mock("@vercel/blob/client", () => ({ upload: mocks.video }));
vi.mock("next/image", () => ({ default: () => null }));
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
  mocks.image.mockResolvedValue("data:image/webp;base64,YWJj");
  mocks.video.mockResolvedValue({ pathname: "portfolio/video-owned.mp4" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(ContentMediaUpload, {
        disabled: false,
        onUploaded: mocks.uploaded,
        onUploading: mocks.uploading,
      }),
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function choose(type: string) {
  const input =
    container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["abc"], "work", { type })],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
}
it("enables photo upload immediately and attaches privately without a description", async () => {
  await choose("image/png");
  const button = container.querySelector<HTMLButtonElement>("button")!;
  expect(button.disabled).toBe(false);
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ id: "owned-photo" }, { status: 201 }),
  );
  await act(async () => button.click());
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
    base64: "YWJj",
    altText: "Photo of my beauty work",
  });
  expect(mocks.uploaded).toHaveBeenCalledWith({
    id: "owned-photo",
    alt_text: "Photo of my beauty work",
    media_type: "image",
    publication_status: "draft",
  });
  expect(mocks.uploading).toHaveBeenLastCalledWith(false);
});
it("uploads video without a description and resolves the owned attachment", async () => {
  await choose("video/mp4");
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      asset: {
        id: "owned-video",
        alt_text: "Video of my beauty work",
        media_type: "video",
        publication_status: "draft",
      },
    }),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(mocks.video.mock.calls[0][2].access).toBe("private");
  expect(JSON.parse(mocks.video.mock.calls[0][2].clientPayload)).toEqual({
    altText: "Video of my beauty work",
  });
  expect(mocks.uploaded.mock.calls[0][0].id).toBe("owned-video");
});
it("keeps the selected file after failure and allows a successful retry", async () => {
  await choose("image/png");
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 }),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(container.textContent).toContain(
    "Could not upload this photo. Please try again.",
  );
  expect(container.querySelector<HTMLButtonElement>("button")!.disabled).toBe(
    false,
  );
  expect(mocks.uploaded).not.toHaveBeenCalled();
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ id: "retry-photo" }, { status: 201 }),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(mocks.uploaded.mock.calls[0][0].id).toBe("retry-photo");
});
it("explains an expired session instead of reporting an unexplained upload failure", async () => {
  await choose("image/png");
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(container.textContent).toContain(
    "Your session has expired. Sign in again to upload.",
  );
});

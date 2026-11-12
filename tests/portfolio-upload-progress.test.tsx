// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PortfolioEditor } from "@/components/portfolio-editor";

const mocks = vi.hoisted(() => ({
  image: vi.fn(),
  upload: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/image-file", () => ({ readImageFile: mocks.image }));
vi.mock("@vercel/blob/client", () => ({ upload: mocks.upload }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

let root: Root;
let container: HTMLDivElement;
let selected: File;
const description = "Finished portfolio work";

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:portfolio-preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.stubGlobal(
    "FormData",
    class {
      get(name: string) {
        if (name === "media") return selected;
        if (name === "altText") return description;
        return null;
      }
    },
  );
  mocks.image.mockResolvedValue("data:image/webp;base64,YWJj");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(React.createElement(PortfolioEditor, { assets: [] })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function selectFile(type: string, name: string) {
  selected = new File(["sample upload bytes"], name, { type });
  const input = container.querySelector<HTMLInputElement>('input[name="media"]')!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [selected],
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    container.querySelector<HTMLFormElement>("form.editor-form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

it("shows upload progress, uses a bounded image request, and clears the loading state", async () => {
  class FakeRequest {
    static last: FakeRequest;
    upload = {
      onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null,
    };
    status = 201;
    responseText = "{}";
    timeout = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    body = "";
    constructor() { FakeRequest.last = this; }
    open = vi.fn();
    setRequestHeader = vi.fn();
    send(body: string) {
      this.body = body;
      this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeRequest);
  await selectFile("image/png", "finished-work.png");
  await submit();
  expect(mocks.image).toHaveBeenCalledWith(selected);
  expect(JSON.parse(FakeRequest.last.body)).toEqual({
    base64: "YWJj",
    altText: description,
  });
  expect(FakeRequest.last.timeout).toBe(90_000);
  expect(container.textContent).toContain("Uploaded privately.");
  expect(container.querySelector<HTMLButtonElement>("form.editor-form > button")?.disabled).toBe(false);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("waits for a registered video before reporting portfolio upload success", async () => {
  mocks.upload.mockImplementation(async (_path, _file, options) => {
    options.onUploadProgress({ percentage: 65 });
    return { pathname: "portfolio/video-finished.mp4" };
  });
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      asset: { id: "video-id", media_type: "video", publication_status: "draft" },
    }),
  );
  await selectFile("video/mp4", "work.mp4");
  await submit();
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(mocks.upload.mock.calls[0][2].access).toBe("private");
  expect(mocks.upload.mock.calls[0][2].onUploadProgress).toBeTypeOf("function");
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
    "/api/v1/professional/portfolio?path=portfolio%2Fvideo-finished.mp4",
  );
  expect(container.textContent).toContain("Uploaded privately.");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("rechecks a completed video without uploading it twice after a registration error", async () => {
  mocks.upload.mockResolvedValue({ pathname: "portfolio/video-pending.mp4" });
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ error: "temporarily unavailable" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({
      asset: { id: "video-id", media_type: "video", publication_status: "draft" },
    }));
  await selectFile("video/mp4", "work.mp4");
  await submit();
  expect(container.textContent).toContain("retry without reuploading");
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(mocks.refresh).not.toHaveBeenCalled();
  await submit();
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

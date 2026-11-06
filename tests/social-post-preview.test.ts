// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  SocialPostPreview,
  TikTokPlayer,
} from "@/components/social-post-preview";
vi.mock("next/image", () => ({
  default: ({
    unoptimized,
    ...p
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", p);
  },
}));
let clean = async () => {};
afterEach(async () => {
  await clean();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render(component: React.ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  clean = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  await act(async () => root.render(component));
  return host;
}
const url = "https://www.tiktok.com/@fixture/video/1234567890123456789";
it("shows an honest missing-cover preview and loads no third-party player until requested", async () => {
  const host = await render(
    React.createElement(SocialPostPreview, {
      post: {
        id: "post",
        platform: "tiktok",
        original_url: url,
        caption: "",
        source_created_at: null,
        service_id: null,
        publication_status: "draft",
        sort_order: 0,
        source_available: true,
        has_thumbnail: false,
      },
    }),
  );
  expect(host.textContent).toContain("No cover image supplied");
  expect(host.querySelector("iframe")).toBeNull();
  await act(async () => host.querySelector("button")!.click());
  const frame = host.querySelector("iframe")!;
  expect(frame.src).toBe(
    "https://www.tiktok.com/player/v1/1234567890123456789?autoplay=0&controls=1",
  );
  expect(host.textContent).toContain("Opening");
  expect(frame.title).toContain("linked TikTok");
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Close TikTok player")!
      .click(),
  );
  expect(host.querySelector("iframe")).toBeNull();
});
it("accepts playback evidence only from its own TikTok frame and reports provider failures safely", async () => {
  const host = await render(
    React.createElement(TikTokPlayer, { url, title: "Fixture" }),
  );
  await act(async () => host.querySelector("button")!.click());
  const frame = host.querySelector("iframe")!;
  const send = async (
    origin: string,
    source: Window | null,
    type: string,
    value?: unknown,
  ) =>
    act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          source,
          data: { "x-tiktok-player": true, type, value },
        }),
      );
    });
  await send("https://evil.test", frame.contentWindow, "onPlayerReady");
  expect(host.textContent).toContain("Opening");
  await send("https://www.tiktok.com", window, "onStateChange", 1);
  expect(host.textContent).not.toContain("Playing on");
  await send("https://www.tiktok.com", frame.contentWindow, "onPlayerReady");
  expect(host.textContent).toContain("Player ready");
  await send("https://www.tiktok.com", frame.contentWindow, "onStateChange", 1);
  expect(host.textContent).toContain("Playing on TikTok");
  await send("https://www.tiktok.com", frame.contentWindow, "onPlayerError", {
    errorType: "private provider description",
  });
  expect(host.textContent).toContain("could not play");
  expect(host.textContent).not.toContain("private provider description");
});
it("does not claim playback when the frame has not confirmed readiness", async () => {
  vi.useFakeTimers();
  const host = await render(
    React.createElement(TikTokPlayer, { url, title: "Fixture" }),
  );
  await act(async () => host.querySelector("button")!.click());
  await act(async () => vi.advanceTimersByTime(15000));
  expect(host.textContent).toContain("Playback has not been confirmed");
});
it("blocks invalid URLs and unavailable-source imports", async () => {
  const host = await render(
    React.createElement(TikTokPlayer, {
      url: "https://evil.test/video/123456",
      title: "Fixture",
    }),
  );
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.textContent).toContain("check the original");
});
it("keeps an unavailable source from loading but offers its original link", async () => {
  const host = await render(
    React.createElement(TikTokPlayer, {
      url,
      title: "Fixture",
      unavailable: true,
    }),
  );
  expect(host.querySelector("button")?.disabled).toBe(true);
  expect(host.querySelector("a")?.href).toBe(url);
});

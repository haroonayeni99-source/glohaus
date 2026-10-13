// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ViewportVideo } from "@/components/viewport-video";

let root: Root;
let container: HTMLDivElement;
let hidden = false;
let reducedMotion = false;
let rejectPlay = false;
const paused = new WeakMap<HTMLMediaElement, boolean>();
const observers: Observer[] = [];
class Observer {
  video!: HTMLVideoElement;
  constructor(readonly callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe(video: HTMLVideoElement) {
    this.video = video;
  }
  disconnect() {}
  show(ratio: number) {
    this.callback(
      [
        {
          isIntersecting: ratio > 0,
          intersectionRatio: ratio,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}
beforeEach(() => {
  hidden = false;
  reducedMotion = false;
  rejectPlay = false;
  observers.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", Observer);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reducedMotion;
    },
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(
    function (this: HTMLMediaElement) {
      return paused.get(this) ?? true;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    if (rejectPlay) return Promise.reject(new Error("Autoplay blocked"));
    paused.set(this, false);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused.set(this, true);
    this.dispatchEvent(new Event("pause"));
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(count = 1) {
  await act(async () =>
    root.render(
      React.createElement(
        React.Fragment,
        null,
        ...Array.from({ length: count }, (_, i) =>
          React.createElement(ViewportVideo, {
            key: i,
            src: `/clip-${i}.mp4`,
            label: `Work ${i}`,
          }),
        ),
      ),
    ),
  );
  return [...container.querySelectorAll("video")];
}
async function click(selector = ".viewport-video-toggle") {
  await act(async () =>
    (container.querySelector(selector) as HTMLButtonElement).click(),
  );
}
it("autoplays visible clips, pauses offscreen, and preserves a deliberate pause", async () => {
  const [video] = await render();
  expect(video.paused).toBe(true);
  await act(async () => observers[0].show(1));
  expect(video.paused).toBe(false);
  expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
    "Pause video: Work 0",
  );
  await click();
  await act(async () => {
    observers[0].show(0);
    observers[0].show(1);
    video.dispatchEvent(new Event("canplay"));
  });
  expect(video.paused).toBe(true);
  await click();
  expect(video.paused).toBe(false);
  await act(async () => observers[0].show(0));
  expect(video.paused).toBe(true);
});
it("selects one clip across a portfolio row and stops playback in hidden tabs", async () => {
  const [first, second] = await render(2);
  await act(async () => {
    observers[0].show(0.75);
    observers[1].show(1);
  });
  expect(first.paused).toBe(true);
  expect(second.paused).toBe(false);
  await act(async () => {
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(second.paused).toBe(true);
  await act(async () => {
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(second.paused).toBe(false);
});
it("offers manual playback when autoplay is blocked or reduced motion is enabled", async () => {
  rejectPlay = true;
  const [video] = await render();
  await act(async () => observers[0].show(1));
  expect(video.paused).toBe(true);
  expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
    "Play video: Work 0",
  );
  rejectPlay = false;
  await click();
  expect(video.paused).toBe(false);
  await act(async () => observers[0].show(0));
  reducedMotion = true;
  await act(async () => observers[0].show(1));
  expect(video.paused).toBe(true);
  await click();
  expect(video.paused).toBe(false);
});
it("starts muted with inline looping and lets viewers switch sound independently", async () => {
  const [video] = await render();
  expect(video.muted).toBe(true);
  expect(video.playsInline).toBe(true);
  expect(video.loop).toBe(true);
  await click(".viewport-video-sound");
  expect(video.muted).toBe(false);
  expect(
    container
      .querySelector(".viewport-video-sound")
      ?.getAttribute("aria-label"),
  ).toBe("Mute video: Work 0");
});

// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  clearAnalyticsIdentity,
  startEngagement,
} from "@/modules/website-analytics/browser";
let payloads: Record<string, unknown>[], clean: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  payloads = [];
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options: RequestInit) => {
      payloads.push(JSON.parse(String(options.body)));
      return { status: 202 };
    }),
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: (items: unknown[]) => void) {}
      observe(target: Element) {
        this.cb([{ target, isIntersecting: true, intersectionRatio: 1 }]);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  clearAnalyticsIdentity();
  clean?.();
  clean = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("never creates identifiers or events on excluded private routes", () => {
  clean = startEngagement("/messages");
  expect(payloads).toHaveLength(0);
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});
it("updates one view, records safe actions only and stops immediately on withdrawal", async () => {
  clean = startEngagement("/");
  expect(payloads).toHaveLength(1);
  document.body.innerHTML =
    '<input value="private@example.com"><a href="/p/private-slug">Private professional name</a>';
  document.querySelector("a")!.addEventListener("click",e=>e.preventDefault());
  document.querySelector("a")!.click();
  await vi.advanceTimersByTimeAsync(15000);
  expect(payloads).toHaveLength(2);
  expect(payloads[0].id).toBe(payloads[1].id);
  expect(payloads[1].clicks).toEqual({ profile: 1 });
  expect(JSON.stringify(payloads)).not.toMatch(
    /private@example|private-slug|Private professional/,
  );
  clearAnalyticsIdentity();
  const count = payloads.length;
  clean();
  expect(payloads).toHaveLength(count);
  expect(localStorage.length).toBe(0);
});
it("starts a new session after 30 minutes without activity", async () => {
  clean = startEngagement("/");
  const first = payloads[0];
  await vi.advanceTimersByTimeAsync(31 * 60000);
  document.dispatchEvent(new Event("pointerdown"));
  expect(payloads.at(-1)?.session).not.toBe(first.session);
  expect(payloads.at(-1)?.visitor).toBe(first.visitor);
});
it("counts actual visible playback, ignores seeking and detects a completed replay", async () => {
  document.body.innerHTML =
    '<div class="viewport-video--feed"><video src="/api/media/00000000-0000-4000-8000-000000000099"></video></div>';
  const video = document.querySelector("video")!;
  Object.defineProperty(video, "duration", { configurable: true, value: 10 });
  Object.defineProperty(video, "readyState", { configurable: true, value: 3 });
  Object.defineProperty(video, "paused", { configurable: true, value: false });
  clean = startEngagement("/discover");
  for (let i = 1; i <= 10; i++) {
    await vi.advanceTimersByTimeAsync(1000);
    video.currentTime = i;
    video.dispatchEvent(new Event("timeupdate"));
  }
  await vi.advanceTimersByTimeAsync(200);
  video.currentTime = 0;
  video.dispatchEvent(new Event("timeupdate"));
  Object.defineProperty(video, "seeking", { configurable: true, value: true });
  video.currentTime = 9;
  video.dispatchEvent(new Event("seeking"));
  clean();
  const videos = payloads.at(-1)?.videos as {
    impressions: number;
    watchMs: number;
    completions: number;
    replays: number;
  }[];
  expect(videos[0].impressions).toBe(1);
  expect(videos[0].watchMs).toBe(10000);
  expect(videos[0].completions).toBe(1);
  expect(videos[0].replays).toBe(1);
});

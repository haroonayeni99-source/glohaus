// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InitialLoadingScreen } from "@/components/initial-loading-screen";
import { readFileSync } from "node:fs";
let container: HTMLDivElement;
let pending: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
    1220,
  );
  container = document.createElement("div");
  pending = document.createElement("div");
  pending.setAttribute("data-glohaus-route-pending", "");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  pending.remove();
  delete document.documentElement.dataset.theme;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};
it("shows the original image artwork even when the first page is ready", async () => {
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  expect(container.querySelector(".glohaus-intro")).not.toBeNull();
  expect(
    container
      .querySelector(".glohaus-route-wordmark-light")
      ?.getAttribute("src"),
  ).toBe("/images/glohaus-wordmark.png");
  expect(
    container
      .querySelector(".glohaus-route-wordmark-night")
      ?.getAttribute("src"),
  ).toBe("/images/glohaus-wordmark-night.png");
  await advance(1899);
  expect(container.querySelector(".is-leaving")).toBeNull();
  await advance(1);
  expect(container.querySelector(".is-leaving")).not.toBeNull();
  await advance(250);
  expect(container.querySelector(".glohaus-intro")).toBeNull();
});
it("waits for actual route readiness after the approved animation duration", async () => {
  document.body.append(pending);
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  await advance(2200);
  expect(container.querySelector(".is-leaving")).toBeNull();
  await act(async () => pending.remove());
  expect(container.querySelector(".is-leaving")).not.toBeNull();
  await advance(250);
  expect(container.querySelector(".glohaus-intro")).toBeNull();
});
it("never replays the entrance during later route fallbacks or a parent rerender", async () => {
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  await advance(1900);
  await advance(250);
  await act(async () => {
    document.body.append(pending);
    root.render(React.createElement(InitialLoadingScreen));
  });
  expect(container.querySelector(".glohaus-intro")).toBeNull();
});
it("preserves night artwork and shortens the entrance for reduced motion", async () => {
  document.documentElement.dataset.theme = "night";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  await advance(899);
  expect(container.querySelector(".glohaus-intro")).not.toBeNull();
  await advance(1);
  expect(container.querySelector(".glohaus-intro")).toBeNull();
});
it("does not become stuck if the artwork or page data never arrives", async () => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
    false,
  );
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
    0,
  );
  document.body.append(pending);
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  await advance(6000);
  expect(container.querySelector(".glohaus-intro")).toBeNull();
});
it("uses the existing bounded image-load fallback before beginning the hold", async () => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
    false,
  );
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  await advance(1200);
  await advance(1900);
  expect(container.querySelector(".is-leaving")).not.toBeNull();
  await advance(250);
  expect(container.querySelector(".glohaus-intro")).toBeNull();
});
it("retains visible server-rendered entry, original palette and reduced-motion rules", () => {
  const css = readFileSync("src/app/glohaus-splash.css", "utf8");
  expect(css).not.toContain("body:has([data-glohaus-route-pending])");
  expect(css).toContain(".glohaus-intro { display: block; }");
  expect(css).toContain("--splash-bg: #f5f2ee");
  expect(css).toContain("--splash-bg: #000");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
});

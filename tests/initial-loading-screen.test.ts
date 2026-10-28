// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InitialLoadingScreen } from "@/components/initial-loading-screen";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("keeps the introduction briefly, then fades and removes it", async () => {
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  expect(container.querySelector(".glohaus-route-loading")).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(1899));
  expect(container.querySelector(".is-leaving")).toBeNull();
  await act(async () => vi.advanceTimersByTime(1));
  expect(container.querySelector(".is-leaving")).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(250));
  expect(container.querySelector(".glohaus-route-loading")).toBeNull();
});
it("does not add a delay for reduced-motion visitors", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  await act(async () => vi.advanceTimersByTime(0));
  expect(container.querySelector(".glohaus-route-loading")).toBeNull();
});

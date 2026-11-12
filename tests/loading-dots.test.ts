// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LoadingDots } from "@/components/loading-dots";

afterEach(() => vi.useRealTimers());
it("delays real pending work, cancels fast work and resets between requests", async () => {
  vi.useFakeTimers();
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(LoadingDots, { busy: true })));
  await act(async () => vi.advanceTimersByTime(199));
  expect(container.querySelector('[role="status"]')).toBeNull();
  await act(async () => root.render(React.createElement(LoadingDots, { busy: false })));
  await act(async () => vi.advanceTimersByTime(500));
  expect(container.children.length).toBe(0);
  await act(async () => root.render(React.createElement(LoadingDots, { busy: true })));
  await act(async () => vi.advanceTimersByTime(200));
  expect(container.querySelectorAll('.glohaus-loading-dots > span')).toHaveLength(3);
  await act(async () => root.render(React.createElement(LoadingDots, { busy: false })));
  expect(container.children.length).toBe(0);
  await act(async () => root.render(React.createElement(LoadingDots, { busy: true })));
  expect(container.children.length).toBe(0);
  await act(async () => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
});

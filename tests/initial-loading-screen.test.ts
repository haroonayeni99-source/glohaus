// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InitialLoadingScreen } from "@/components/initial-loading-screen";
import Loading from "@/app/loading";

let container: HTMLDivElement;
let pending: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  pending = document.createElement("div");
  pending.setAttribute("data-glohaus-route-pending", "");
  document.body.append(container, pending);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); pending.remove();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});
it("skips entry branding when the document is already ready", async () => {
  pending.remove();
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  expect(container.querySelector('.glohaus-intro')).toBeNull();
});
it("removes branding immediately when initial route content arrives, without waiting for images", async () => {
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  expect(container.querySelector('.glohaus-intro')).not.toBeNull();
  await act(async () => pending.remove());
  expect(container.querySelector('.glohaus-intro')).toBeNull();
});
it("never replays branding during subsequent route navigation", async () => {
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  await act(async () => pending.remove());
  await act(async () => document.body.append(pending));
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  expect(container.querySelector('.glohaus-intro')).toBeNull();
});
it("uses the same immediate readiness behaviour for night and reduced motion", async () => {
  document.documentElement.dataset.theme='night';
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));
  await act(async () => root.render(React.createElement(InitialLoadingScreen)));
  await act(async () => pending.remove());
  expect(container.querySelector('.glohaus-intro')).toBeNull();
});
it("routine route loading is an inline status, never a full-screen brand", async () => {
  await act(async () => root.render(React.createElement(Loading)));
  expect(container.querySelector('[data-glohaus-route-pending]')).not.toBeNull();
  expect(container.querySelector('[role=status]')?.textContent).toBe('Loading this page…');
  expect(container.querySelector('.glohaus-route-loading')).toBeNull();
});

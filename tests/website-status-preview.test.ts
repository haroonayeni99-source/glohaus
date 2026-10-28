// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebsiteStatusControl } from "@/components/website-status-control";
vi.mock("next/link", () => ({ default: (props: object) => React.createElement("a", props) }));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("shows the private preview link when the public website is off", async () => {
  await act(async () => root.render(React.createElement(WebsiteStatusControl, { initialEnabled: false })));
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/");
  expect(container.textContent).toContain("Public visitors will still see the maintenance page");
  expect(container.querySelector("button")?.textContent).toContain("Turn website ON");
});
it("keeps the public website switch when the site is on", async () => {
  await act(async () => root.render(React.createElement(WebsiteStatusControl, { initialEnabled: true })));
  expect(container.querySelector(".website-status-preview")).toBeNull();
  expect(container.querySelector("button")?.textContent).toContain("Turn website OFF");
});

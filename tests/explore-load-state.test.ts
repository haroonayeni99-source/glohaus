// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExploreMapExperience } from "@/components/explore-map-experience";
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("@/components/geographic-map", () => ({ GeographicMap: () => null }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
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
async function render(loadFailed: boolean) {
  await act(async () =>
    root.render(
      React.createElement(ExploreMapExperience, {
        professionals: [],
        query: "braids",
        filters: { ...defaultDiscoveryFilters, location: "Southwark" },
        loadFailed,
      }),
    ),
  );
}
it("distinguishes a failed load from a successful empty search and retries without navigating away", async () => {
  await render(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "We couldn’t load professionals",
  );
  expect(container.textContent).not.toContain("No matching professionals yet");
  expect(container.textContent).not.toContain("0 matching professionals");
  const retry = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Retry loading results",
  )!;
  await act(async () => retry.click());
  expect(refresh).toHaveBeenCalledOnce();
  expect(
    container.querySelector<HTMLInputElement>('input[name="q"]')?.value,
  ).toBe("braids");
  await render(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("No matching professionals yet");
});

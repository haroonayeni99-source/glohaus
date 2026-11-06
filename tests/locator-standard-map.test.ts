// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProfessionalLocatorMap } from "@/components/professional-locator-map";
vi.mock("@/lib/maplibre-client", () => ({
  supportsMapGraphics: () => false,
  loadMapLibre: vi.fn(),
}));
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", props),
}));
it("keeps consent gating and supplies working standard zoom, pan and pin selection without WebGL", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const selected = vi.fn(),
    viewport = vi.fn();
  const props = {
    pins: [
      {
        id: "test",
        latitude: 51.5074,
        longitude: -0.1278,
        label: "Test professional",
        priceLabel: "£20",
      },
    ],
    focus: { latitude: 51.5074, longitude: -0.1278 },
    onSelect: selected,
    onViewportChange: viewport,
    resetLondonSignal: 0,
  };
  try {
    await act(async () =>
      root.render(React.createElement(ProfessionalLocatorMap, props)),
    );
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".geo-map-surface")).toBeNull();
    await act(async () => {
      [...host.querySelectorAll("button")]
        .find((x) => x.textContent === "Load street map")!
        .click();
    });
    const surface = host.querySelector(".geo-map-surface")!;
    expect(surface).not.toBeNull();
    expect(host.textContent).toContain("Using the standard street map");
    expect(surface.getAttribute("data-zoom")).toBe("10");
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Zoom in street map"]')!
        .click(),
    );
    expect(surface.getAttribute("data-zoom")).toBe("11");
    const before = surface.getAttribute("data-center-longitude");
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Move street map right"]',
        )!
        .click(),
    );
    expect(surface.getAttribute("data-center-longitude")).not.toBe(before);
    await act(async () =>
      root.render(
        React.createElement(ProfessionalLocatorMap, {
          ...props,
          resetLondonSignal: 1,
        }),
      ),
    );
    expect(surface.getAttribute("data-zoom")).toBe("10");
    expect(Number(surface.getAttribute("data-center-longitude"))).toBeCloseTo(
      -0.1278,
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Test professional, from £20"]',
        )!
        .click(),
    );
    expect(selected).toHaveBeenCalledWith("test");
    expect(viewport).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

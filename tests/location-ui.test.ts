// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ExploreMapExperience } from "@/components/explore-map-experience";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()})}));
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";
it("does not send a delayed device location after leaving Explore", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetchMock = vi
    .fn()
    .mockResolvedValue(Response.json({ professionals: [], truncated: false }));
  vi.stubGlobal("fetch", fetchMock);
  let success: PositionCallback | undefined;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (callback: PositionCallback) => {
        success = callback;
      },
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        React.createElement(ExploreMapExperience, {
          professionals: [],
          query: "",
          filters: defaultDiscoveryFilters,
        }),
      ),
    );
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Use my location",
    )!;
    await act(async () => button.click());
    expect(success).toBeDefined();
    await act(async () =>
      root.render(React.createElement("p", {}, "Another page")),
    );
    await act(async () =>
      success!({
        coords: {
          latitude: 51.5,
          longitude: -0.12,
          accuracy: 20,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

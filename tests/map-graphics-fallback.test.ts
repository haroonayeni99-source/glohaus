import { afterEach, describe, expect, it, vi } from "vitest";
import { supportsMapGraphics } from "@/lib/maplibre-client";
afterEach(() => vi.unstubAllGlobals());
describe("map renderer support", () => {
  it("returns false when WebGL2 is denied rather than exposing a broken map", () => {
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => null }),
    });
    expect(supportsMapGraphics()).toBe(false);
  });
  it("handles context initialisation errors without propagating a page failure", () => {
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => {
          throw Error("Graphics disabled");
        },
      }),
    });
    expect(supportsMapGraphics()).toBe(false);
  });
  it("releases its probe context before the actual map allocates one", () => {
    const loseContext = vi.fn();
    const getContext = vi.fn(() => ({ getExtension: () => ({ loseContext }) }));
    vi.stubGlobal("document", { createElement: () => ({ getContext }) });
    expect(supportsMapGraphics()).toBe(true);
    expect(getContext).toHaveBeenCalledWith("webgl2");
    expect(loseContext).toHaveBeenCalledOnce();
  });
});

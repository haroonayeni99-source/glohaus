import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

const originalVersion = Object.getOwnPropertyDescriptor(process, "version")!;

afterEach(() => {
  Object.defineProperty(process, "version", originalVersion);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("hosted function runtime security floor", () => {
  it.each(["v24.21.0", "v24.22.0", "v22.23.4"])(
    "blocks %s even when a build used a patched Node binary",
    (version) => {
      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      Object.defineProperty(process, "version", { value: version });
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      expect(() => register()).toThrow("Deployment blocked");
      expect(log).toHaveBeenCalledWith("GLOHAUS Node.js runtime", {
        node: version,
      });
    },
  );

  it("allows the fixed managed runtime and logs only the Node version", () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    Object.defineProperty(process, "version", { value: "v24.22.1" });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(() => register()).not.toThrow();
    expect(log).toHaveBeenCalledExactlyOnceWith("GLOHAUS Node.js runtime", {
      node: "v24.22.1",
    });
  });

  it("does not load Node runtime policy for a non-Node build context", () => {
    vi.stubEnv("NEXT_RUNTIME", "");
    Object.defineProperty(process, "version", { value: "v24.21.0" });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(() => register()).not.toThrow();
    expect(log).not.toHaveBeenCalled();
  });
});

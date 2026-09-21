import { describe, expect, it } from "vitest";
import { assertSameOrigin, smallJson } from "@/lib/http";

describe("request boundary", () => {
  it("rejects a cross-origin enrollment request", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://beauty.example";
    expect(() =>
      assertSameOrigin(
        new Request("https://beauty.example/api", {
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
          },
        }),
      ),
    ).toThrow("FORBIDDEN");
  });
  it("rejects browser writes without an origin", () =>
    expect(() =>
      assertSameOrigin(new Request("https://beauty.example/api")),
    ).toThrow("FORBIDDEN"));
  it("accepts matching origin JSON requests", () =>
    expect(() =>
      assertSameOrigin(
        new Request("https://beauty.example/api", {
          headers: {
            origin: "https://beauty.example",
            "content-type": "application/json",
          },
        }),
      ),
    ).not.toThrow());
  it("rejects non-JSON writes", () =>
    expect(() =>
      assertSameOrigin(
        new Request("https://beauty.example/api", {
          headers: {
            origin: "https://beauty.example",
            "content-type": "text/plain",
          },
        }),
      ),
    ).toThrow("INVALID_REQUEST"));
  it("rejects invalid JSON", async () =>
    expect(
      smallJson(
        new Request("https://beauty.example/api", {
          method: "POST",
          body: "{",
        }),
      ),
    ).rejects.toThrow("INVALID_REQUEST"));
  it("enforces a body size limit without relying on Content-Length", async () =>
    expect(
      smallJson(
        new Request("https://beauty.example/api", {
          method: "POST",
          body: "a".repeat(1025),
        }),
      ),
    ).rejects.toThrow("INVALID_REQUEST"));
  it("reads a valid enrollment body", async () =>
    expect(
      smallJson(
        new Request("https://beauty.example/api", {
          method: "POST",
          body: '{"role":"customer"}',
        }),
      ),
    ).resolves.toEqual({ role: "customer" }));
});

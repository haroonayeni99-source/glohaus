import { describe, expect, it } from "vitest";
import { apiError, assertSameOrigin, smallJson } from "@/lib/http";

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

  it("accepts a valid preview origin even when the canonical app URL differs", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://glohaus.example";
    expect(() =>
      assertSameOrigin(
        new Request("https://preview-glohaus.vercel.app/api", {
          headers: {
            origin: "https://preview-glohaus.vercel.app",
            "content-type": "application/json",
          },
        }),
      ),
    ).not.toThrow();
  });
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

describe("Database decision responses", () => {
  it("returns a recoverable conflict for a disallowed state transition", async () => {
    const response = apiError({ code: "22023", message: "INVALID_TRANSITION" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_REQUEST" },
    });
  });
  it("returns forbidden for a known database access denial without leaking details", async () => {
    const response = apiError({ code: "42501", message: "FORBIDDEN" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "FORBIDDEN" } });
  });
});

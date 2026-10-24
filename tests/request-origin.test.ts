import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requestOrigin } from "@/lib/request-origin";
import { assertSameOrigin } from "@/lib/http";
import {
  bookingCancelPath,
  paymentReturnOrigin,
} from "@/modules/payments/return-url";

beforeEach(() => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.glohaus.shop");
  vi.stubEnv("VERCEL_URL", "isolated-glohaus.vercel.app");
  vi.stubEnv("VERCEL_BRANCH_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
});
afterEach(() => vi.unstubAllEnvs());
function proxied(headers: Record<string, string> = {}) {
  return new Request("http://0.0.0.0:80/api/v1/admin/homepage-media/upload", {
    method: "POST",
    headers: {
      host: "www.glohaus.shop",
      origin: "https://www.glohaus.shop",
      "content-type": "application/json",
      ...headers,
    },
  });
}
it("accepts a legitimate public-origin write behind the internal container URL", () => {
  expect(requestOrigin(proxied())).toBe("https://www.glohaus.shop");
  expect(() => assertSameOrigin(proxied())).not.toThrow();
});
it.each([
  "https://evil.test",
  "null",
  "http://www.glohaus.shop",
  "https://www.glohaus.shop.evil.test",
  "",
])("still rejects an untrusted browser origin: %s", (origin) => {
  expect(() =>
    assertSameOrigin(proxied({ origin, "x-forwarded-host": "evil.test" })),
  ).toThrow("FORBIDDEN");
});
it("does not let a forged forwarded host override the canonical host", () => {
  expect(() =>
    assertSameOrigin(
      proxied({
        origin: "https://isolated-glohaus.vercel.app",
        "x-forwarded-host": "isolated-glohaus.vercel.app",
      }),
    ),
  ).toThrow("FORBIDDEN");
});
it("supports exactly the configured preview host when the listener Host is internal", () => {
  const request = proxied({
    host: "0.0.0.0:80",
    "x-forwarded-host": "isolated-glohaus.vercel.app",
    origin: "https://isolated-glohaus.vercel.app",
  });
  expect(requestOrigin(request)).toBe("https://isolated-glohaus.vercel.app");
  expect(() => assertSameOrigin(request)).not.toThrow();
});
it("never trusts an unknown forwarded host or a comma-separated host chain", () => {
  expect(() =>
    assertSameOrigin(
      proxied({
        host: "0.0.0.0:80",
        "x-forwarded-host": "evil.test, www.glohaus.shop",
        origin: "https://evil.test",
      }),
    ),
  ).toThrow("FORBIDDEN");
});
it("keeps localhost origin checks independent of hosted configuration", () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  const request = new Request("http://127.0.0.1:3097/api", {
    headers: {
      origin: "http://127.0.0.1:3097",
      "content-type": "application/json",
    },
  });
  expect(requestOrigin(request)).toBe("http://127.0.0.1:3097");
  expect(() => assertSameOrigin(request)).not.toThrow();
});
it("fails closed on public browser origins if hosted public configuration is absent", () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_URL", "");
  expect(() => assertSameOrigin(proxied())).toThrow("FORBIDDEN");
});
it("keeps vercel dev on its local origin even when a hosted app URL is configured", () => {
  vi.stubEnv("VERCEL_ENV", "development");
  const request = new Request("http://localhost:3000/api", {
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
  });
  expect(requestOrigin(request)).toBe("http://localhost:3000");
  expect(() => assertSameOrigin(request)).not.toThrow();
});
it("preserves JSON-only request validation behind the container", () => {
  expect(() =>
    assertSameOrigin(proxied({ "content-type": "text/plain" })),
  ).toThrow("INVALID_REQUEST");
});
it("keeps checkout success/cancel URLs on the same public site behind the proxy", () => {
  const request = proxied({
    referer: "https://www.glohaus.shop/p/studio?service=hair",
  });
  expect(paymentReturnOrigin(request)).toBe("https://www.glohaus.shop");
  expect(bookingCancelPath(request, "fixture-booking")).toBe(
    "/p/studio?service=hair#booking",
  );
});

import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/config", () => ({
  authConfigured: () => false,
  publicSupabaseKey: () => null,
}));
import proxy from "@/proxy";
import { contentSecurityPolicy } from "@/lib/content-security-policy";
afterEach(() => vi.unstubAllEnvs());
it("uses an unpredictable, fresh nonce and replaces client-supplied security headers", async () => {
  const a = new NextRequest("https://www.glohaus.shop/sign-in", {
    headers: {
      "x-nonce": "attacker",
      "Content-Security-Policy": "script-src *",
    },
  });
  const response = await proxy(a);
  const nonce = a.headers.get("x-nonce")!;
  expect(nonce).not.toBe("attacker");
  expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
  expect(response.headers.get("Content-Security-Policy")).toContain(
    `'nonce-${nonce}'`,
  );
  expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  const b = new NextRequest("https://www.glohaus.shop/explore");
  await proxy(b);
  expect(b.headers.get("x-nonce")).not.toBe(nonce);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("leaves Stripe webhook bodies untouched", async () => {
  const body = '{"id":"fixture-event","data":{}}';
  const request = new NextRequest(
    "https://www.glohaus.shop/api/webhooks/stripe",
    { method: "POST", body },
  );
  const response = await proxy(request);
  expect(await request.text()).toBe(body);
  expect(response.headers.get("Content-Security-Policy")).toBeNull();
});
it("blocks unapproved scripts, objects and framing without disabling map workers or secure provider connections", () => {
  const policy = contentSecurityPolicy("fixture-nonce");
  const scripts = policy.split("; ").find((x) => x.startsWith("script-src"))!;
  expect(scripts).not.toContain("unsafe-inline");
  expect(scripts).not.toContain("unsafe-eval");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("worker-src 'self' blob:");
  expect(policy).toContain("https://checkout.stripe.com");
  expect(contentSecurityPolicy("fixture", true)).toContain("'unsafe-eval'");
  expect(contentSecurityPolicy("fixture", false, false)).not.toContain(
    "upgrade-insecure-requests",
  );
  expect(contentSecurityPolicy("fixture", false, true)).toContain(
    "upgrade-insecure-requests",
  );
});

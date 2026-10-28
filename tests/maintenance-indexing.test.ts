import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const auth = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  claims: vi.fn(),
  account: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/config", () => ({
  authConfigured: auth.configured,
  publicSupabaseKey: () => "test-public-key",
}));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: auth.session }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: auth.claims },
    rpc: auth.account,
  }),
}));
import proxy from "@/proxy";
import { metadata as maintenanceMetadata } from "@/app/maintenance/page";

const status = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubGlobal("fetch", status);
  status.mockResolvedValue(new Response("false"));
  auth.configured.mockReturnValue(true);
  auth.claims.mockResolvedValue({ data: null, error: null });
  auth.account.mockResolvedValue({
    data: { status: "active", roles: ["owner"] },
    error: null,
  });
  auth.session.mockImplementation(async () => {
    const response = NextResponse.next();
    response.cookies.set("test-session", "refreshed", { httpOnly: true });
    return response;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Temporary maintenance indexing", () => {
  it("forwards old checkout returns before reading a separate-host session", async () => {
    const response = await proxy(new NextRequest("https://glohaus1.vercel.app/account/bookings/11111111-1111-4111-8111-111111111111?checkout=cancelled"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.glohaus.shop/account/bookings/11111111-1111-4111-8111-111111111111?checkout=cancelled");
    expect(auth.session).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
  it.each(["/", "/explore?category=Nails", "/about", "/p/real-studio"])(
    "signals temporary unavailability for %s without dropping refreshed sessions",
    async (path) => {
      const response = await proxy(
        new NextRequest(`https://www.glohaus.shop${path}`),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        "https://www.glohaus.shop/maintenance",
      );
      expect(response.headers.get("retry-after")).toBe("3600");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.cookies.get("test-session")?.value).toBe("refreshed");
      expect(maintenanceMetadata.robots).toEqual({ index: true, follow: true });
    },
  );
  it.each([
    "/robots.txt",
    "/sitemap.xml",
    "/admin",
    "/sign-in",
    "/api/v1/bookings",
  ])(
    "preserves the real response for %s while the public site is off",
    async (path) => {
      const response = await proxy(
        new NextRequest(`https://www.glohaus.shop${path}`),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(status).not.toHaveBeenCalled();
    },
  );
  it("does not turn the crawler exemption into a subtree bypass", async () => {
    const response = await proxy(
      new NextRequest("https://www.glohaus.shop/sitemap.xml/private"),
    );
    expect(response.status).toBe(503);
  });
  it("keeps direct maintenance visits unavailable even when the public site is on", async () => {
    status.mockResolvedValue(new Response("true"));
    const response = await proxy(
      new NextRequest("https://www.glohaus.shop/maintenance"),
    );
    expect(response.status).toBe(503);
    expect(status).not.toHaveBeenCalled();
  });
  it("preserves live public pages when the Owner enables the website", async () => {
    status.mockResolvedValue(new Response("true"));
    const response = await proxy(
      new NextRequest("https://www.glohaus.shop/explore"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
  it("preserves active Owner access during maintenance", async () => {
    auth.claims.mockResolvedValue({
      data: { claims: { sub: "owner-id" } },
      error: null,
    });
    const response = await proxy(
      new NextRequest("https://www.glohaus.shop/explore"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
  it("allows an active Admin to view the private site", async () => {
    auth.claims.mockResolvedValue({ data: { claims: { sub: "admin-id" } }, error: null });
    auth.account.mockResolvedValue({ data: { status: "active", roles: ["admin"] }, error: null });
    const response = await proxy(new NextRequest("https://www.glohaus.shop/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
  it.each([
    { status: "suspended", roles: ["admin"] },
    { status: "active", roles: ["owner"], deletedAt: "2026-01-01" },
    { status: "active", roles: ["admin"], restrictedUntil: "2999-01-01T00:00:00Z" },
    { status: "active", roles: ["professional"] },
  ])("does not grant bypass to a restricted or non-admin account %#", async (account) => {
    auth.claims.mockResolvedValue({ data: { claims: { sub: "account-id" } }, error: null });
    auth.account.mockResolvedValue({ data: account, error: null });
    const response = await proxy(new NextRequest("https://www.glohaus.shop/"));
    expect(response.status).toBe(503);
  });
  it("does not grant bypass when identity or role lookup fails", async () => {
    auth.claims.mockResolvedValue({ data: { claims: { sub: "account-id" } }, error: null });
    auth.account.mockResolvedValue({ data: null, error: new Error("unavailable") });
    expect((await proxy(new NextRequest("https://www.glohaus.shop/"))).status).toBe(503);
  });
  it("does not grant customer accounts maintenance bypass", async () => {
    auth.claims.mockResolvedValue({
      data: { claims: { sub: "customer-id" } },
      error: null,
    });
    auth.account.mockResolvedValue({
      data: { status: "active", roles: ["customer"] },
      error: null,
    });
    const response = await proxy(
      new NextRequest("https://www.glohaus.shop/explore"),
    );
    expect(response.status).toBe(503);
  });
  it("preserves the canonical hostname redirect", async () => {
    const response = await proxy(
      new NextRequest("https://glohaus.shop/explore"),
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://www.glohaus.shop/explore",
    );
  });
});

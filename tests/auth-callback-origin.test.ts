import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  verify: vi.fn(),
  identity: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession: mocks.exchange, verifyOtp: mocks.verify },
  }),
}));
vi.mock("@/lib/db", () => ({ withIdentity: mocks.identity }));
import { GET } from "@/app/auth/callback/route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.glohaus.shop");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-fixture");
  mocks.exchange.mockResolvedValue({
    data: { user: { id: "fixture-user", email: "fixture@example.test" } },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
function request(query: string) {
  return new NextRequest(`http://0.0.0.0:80/auth/callback${query}`, {
    headers: { host: "www.glohaus.shop" },
  });
}
it("returns missing-code failures to public sign-in rather than the private listener", async () => {
  const response = await GET(request(""));
  expect(response.headers.get("location")).toBe(
    "https://www.glohaus.shop/sign-in?authError=missing_code",
  );
  expect(mocks.identity).not.toHaveBeenCalled();
});
it("finishes recovery on the public host without redirecting back to the same callback", async () => {
  const response = await GET(
    request("?code=fictional-code&next=%2Freset-password"),
  );
  expect(mocks.exchange).toHaveBeenCalledWith("fictional-code");
  expect(response.headers.get("location")).toBe(
    "https://www.glohaus.shop/reset-password",
  );
  expect(response.cookies.get("glohaus_password_recovery")?.value).toBe("1");
  expect(mocks.identity).not.toHaveBeenCalled();
});

function isolatedRecovery(enabled = true) {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_URL", "validation.vercel.app");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://validation.vercel.app");
  vi.stubEnv("GLOHAUS_ISOLATED_PREVIEW_AUTH", enabled ? "true" : "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://rqsyakggwmpkqzzogvll.supabase.co");
  vi.stubEnv("DATABASE_URL", "postgresql://validation:synthetic@db.rqsyakggwmpkqzzogvll.supabase.co/postgres");
  return new NextRequest("https://validation.vercel.app/auth/callback?code=fictional-code&next=%2Freset-password");
}
it("completes recovery locally on the explicitly isolated preview", async () => {
  const response = await GET(isolatedRecovery());
  expect(mocks.exchange).toHaveBeenCalledWith("fictional-code");
  expect(response.headers.get("location")).toBe("https://validation.vercel.app/reset-password");
  expect(response.cookies.get("glohaus_password_recovery")?.value).toBe("1");
});
it("preserves the production recovery handoff for ordinary previews", async () => {
  const response = await GET(isolatedRecovery(false));
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(response.headers.get("location")).toContain("https://www.glohaus.shop/auth/callback?");
});
it("rejects a production database behind an isolated recovery flag", async () => {
  const request = isolatedRecovery();
  vi.stubEnv("DATABASE_URL", "postgresql://validation:synthetic@db.tyycrmmczsgnowditnii.supabase.co/postgres");
  const response = await GET(request);
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(response.headers.get("location")).toContain("https://www.glohaus.shop/auth/callback?");
});

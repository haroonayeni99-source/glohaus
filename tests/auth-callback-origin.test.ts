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

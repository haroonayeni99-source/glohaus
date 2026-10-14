import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
type Cookies = {
  setAll: (
    items: { name: string; value: string; options?: { path: string } }[],
    headers: Record<string, string>,
  ) => void;
};
const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  cookies: null as Cookies | null,
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: unknown,
    _key: unknown,
    options: { cookies: Cookies },
  ) => {
    mocks.cookies = options.cookies;
    return { auth: { getClaims: mocks.claims } };
  },
}));
vi.mock("@/lib/config", () => ({ publicSupabaseKey: () => "test-key" }));
function request() {
  return new NextRequest("https://glohaus.test/about", {
    headers: {
      cookie:
        "sb-test-auth-token.0=valid-part-one; sb-test-auth-token.1=valid-part-two; unrelated=keep",
    },
  });
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({
    data: { claims: { sub: "test-user" } },
    error: null,
  });
});
it.each([
  { name: "AuthRetryableFetchError", status: 503 },
  { status: 429 },
  { message: "Network unavailable" },
])(
  "keeps valid session cookies after a transient Auth response: %j",
  async (error) => {
    mocks.claims.mockResolvedValue({ data: null, error });
    const req = request();
    const response = await updateSession(req);
    expect(response.cookies.getAll()).toEqual([]);
    expect(req.cookies.get("sb-test-auth-token.0")?.value).toBe(
      "valid-part-one",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  },
);
it("keeps cookies after a thrown connection failure and recovers on the next request", async () => {
  mocks.claims.mockRejectedValueOnce(new TypeError("fetch failed"));
  expect((await updateSession(request())).cookies.getAll()).toEqual([]);
  expect((await updateSession(request())).cookies.getAll()).toEqual([]);
});
it("persists refreshed cookies and Auth cache headers", async () => {
  mocks.claims.mockImplementation(async () => {
    mocks.cookies!.setAll(
      [
        {
          name: "sb-test-auth-token.0",
          value: "renewed",
          options: { path: "/" },
        },
      ],
      { "X-Auth-Test": "renewed" },
    );
    return { data: { claims: { sub: "user" } }, error: null };
  });
  const req = request();
  const response = await updateSession(req);
  expect(req.cookies.get("sb-test-auth-token.0")?.value).toBe("renewed");
  expect(response.cookies.get("sb-test-auth-token.0")?.value).toBe("renewed");
  expect(response.headers.get("x-auth-test")).toBe("renewed");
});
it.each(["refresh_token_not_found", "session_not_found", "bad_jwt"])(
  "clears only this project's definitively invalid session (%s)",
  async (code) => {
    mocks.claims.mockResolvedValue({ data: null, error: { code } });
    const response = await updateSession(request());
    expect(response.cookies.getAll()).toHaveLength(2);
    expect(
      response.cookies
        .getAll()
        .every((cookie) => cookie.value === "" && cookie.maxAge === 0),
    ).toBe(true);
    expect(response.cookies.get("unrelated")).toBeUndefined();
  },
);
it("clears malformed cookie data without clearing unrelated cookies", async () => {
  mocks.claims.mockRejectedValueOnce(new SyntaxError("Invalid JSON"));
  expect((await updateSession(request())).cookies.getAll()).toHaveLength(2);
});

import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/admin/quality-control/health/route";

const mocks = vi.hoisted(() => ({ allowed: true, fetch: vi.fn() }));
vi.mock("@/modules/admin/repository", () => ({
  withOwner: async (fn: () => Promise<unknown>) => {
    if (!mocks.allowed) throw new Error("FORBIDDEN");
    return fn();
  },
}));
vi.mock("@/lib/http", () => ({
  apiError: () => Response.json({ error: "Forbidden" }, { status: 403 }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.fetch = vi.fn().mockImplementation(async () => new Response("<main>Public fixture</main>", {headers:{"Content-Type":"text/html"}}));
  vi.stubGlobal("fetch", mocks.fetch);
});

it("refuses unauthorised diagnostics before making any outbound request", async () => {
  mocks.allowed = false;
  const response = await GET();
  expect(response.status).toBe(403);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("checks only fixed public routes without user credentials", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  const result = await response.json();
  expect(result.checks.map((c: { path: string }) => c.path)).toEqual(["/", "/shop", "/discover"]);
  for (const call of mocks.fetch.mock.calls) {
    expect(call[0]).toMatch(/^https:\/\/www\.glohaus\.shop\/(?:shop|discover)?$/);
    expect(call[1]).toMatchObject({ method: "GET", cache: "no-store" });
    expect(call[1].headers).not.toHaveProperty("Cookie");
  }
});

it("reports a failed route without hiding successful checks", async () => {
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url.endsWith("/shop")) throw new Error("network unavailable");
    return new Response("<main>Public fixture</main>",{headers:{"Content-Type":"text/html"}});
  });
  const response = await GET();
  const result = await response.json();
  expect(result.checks.map((c: { ok: boolean }) => c.ok)).toEqual([true, false, true]);
  expect(result.checks[1].status).toBeNull();
});

it("does not report streamed HTTP-200 render failures as healthy", async()=>{
 mocks.fetch.mockImplementation(async(url:string)=>new Response(url.endsWith('/shop')?'<main>Shell</main><script>1:E{\\"digest\\":\\"safe-fixture\\"}</script>':'<main>Public fixture</main>',{headers:{'Content-Type':'text/html'}}));
 const result=await(await GET()).json();expect(result.checks.map((c:{ok:boolean})=>c.ok)).toEqual([true,false,true]);expect(result.checks[1].reason).toBe('render_error');
 expect(JSON.stringify(result)).not.toContain('safe-fixture');
});

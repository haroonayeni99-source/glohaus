import { beforeEach, it, expect, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
const mocks = vi.hoisted(() => ({ denied: false, query: vi.fn() }));
vi.mock("@/lib/identity", () => ({
  getIdentity: async () => {
    if (mocks.denied) throw new AccessError("UNAUTHENTICATED", 401);
    return { authId: "professional", secondFactorAge: 0 };
  },
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async (_id: string, work: (db: object) => unknown) =>
    work({ query: mocks.query }),
}));
vi.mock("@/modules/accounts/repository", () => ({
  findAccount: async () => ({
    authId: "professional",
    status: "active",
    roles: ["professional"],
  }),
}));
import { GET } from "@/app/api/v1/notifications/stream/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied = false;
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("count(*)")
      ? [{ count: 2 }]
      : [{ id: "owned-event", href: "/professional/orders" }],
  }));
});
it("streams only through the authenticated RLS-scoped repository with private cache headers", async () => {
  const response = await GET(
    new Request("https://glohaus.test/api/v1/notifications/stream"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  const reader = response.body!.getReader();
  const chunk = await reader.read();
  expect(new TextDecoder().decode(chunk.value)).toContain("owned-event");
  expect(new TextDecoder().decode(chunk.value)).toContain('"unread":2');
  await reader.cancel();
});
it("returns unauthorized without querying an inbox when signed out", async () => {
  mocks.denied = true;
  expect(
    (await GET(new Request("https://glohaus.test/api/v1/notifications/stream")))
      .status,
  ).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});

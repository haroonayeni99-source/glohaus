import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  denied: null as AccessError | null,
}));
vi.mock("@/lib/api-account", () => ({
  withAccount: async (role: string, work: (db: object) => unknown) => {
    expect(role).toBe("customer");
    if (mocks.denied) throw mocks.denied;
    return work({ query: mocks.query });
  },
}));
import { GET, POST, PUT, DELETE } from "@/app/api/v1/cart/route";

const productId = "11111111-1111-4111-8111-111111111111";
const cart = { items: [], itemCount: 0, totalPence: 0 };
function request(
  method = "POST",
  body: unknown = { productId, quantity: 1 },
  origin = "https://glohaus.test",
) {
  return new Request("https://glohaus.test/api/v1/cart", {
    method,
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied = null;
  mocks.query.mockResolvedValue({ rows: [{ data: cart }] });
});
afterEach(() => vi.restoreAllMocks());

describe("Cart API decisions", () => {
  it.each([
    "PRODUCT_UNAVAILABLE",
    "INSUFFICIENT_STOCK",
    "INVALID_QUANTITY",
    "SELF_PURCHASE_NOT_ALLOWED",
  ])("returns %s as a conflict rather than an outage", async (message) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockRejectedValue(
      Object.assign(new Error(message), {
        code: "22023",
        detail: "private SQL detail",
      }),
    );
    for (const [handler, method] of [
      [POST, "POST"],
      [PUT, "PUT"],
    ] as const) {
      const response = await handler(request(method));
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: { code: message } });
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(log).not.toHaveBeenCalled();
  });
  it("preserves successful read, add, update and clear results", async () => {
    expect(await (await GET()).json()).toEqual({ cart });
    expect((await POST(request())).status).toBe(201);
    expect(mocks.query).toHaveBeenLastCalledWith(
      "SELECT beauty.add_cart_item($1,$2) AS data",
      [productId, 1],
    );
    expect((await PUT(request("PUT", { productId, quantity: 0 }))).status).toBe(
      200,
    );
    expect(mocks.query).toHaveBeenLastCalledWith(
      "SELECT beauty.set_cart_item($1,$2) AS data",
      [productId, 0],
    );
    expect(await (await DELETE(request("DELETE", {}))).json()).toEqual({
      cart,
    });
  });
  it("keeps authentication, roles, request validation and same-origin checks", async () => {
    expect(
      (
        await POST(
          request("POST", { productId, quantity: 1 }, "https://evil.test"),
        )
      ).status,
    ).toBe(403);
    expect(
      (await POST(request("POST", { productId, quantity: 21 }))).status,
    ).toBe(400);
    expect(
      (await POST(request("POST", { productId, quantity: 0 }))).status,
    ).toBe(400);
    for (const code of [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "ACCOUNT_INACTIVE",
    ] as const) {
      mocks.denied = new AccessError(
        code,
        code === "UNAUTHENTICATED" ? 401 : 403,
      );
      const response = await POST(request());
      expect(await response.json()).toEqual({ error: { code } });
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("keeps unknown failures unavailable and logs only safe cart diagnostics", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockRejectedValue(
      Object.assign(new Error("private SQL and customer@example.test"), {
        code: "42501",
        detail: "secret database detail",
      }),
    );
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "UNAVAILABLE" } });
    expect(log).toHaveBeenCalledWith("Account request failed", {
      type: "Error",
      operation: "cart.add",
      code: "42501",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private SQL");
  });
  it.each(["22023", "customer@example.test", null])(
    "does not turn unknown provider details into a cart decision (%s)",
    async (code) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.query.mockRejectedValue({
        code,
        message: "private provider detail",
      });
      expect((await PUT(request("PUT"))).status).toBe(503);
      expect(log).toHaveBeenCalledWith("Account request failed", {
        type: "UnknownError",
        operation: "cart.update",
        code: code === "22023" ? code : "UNKNOWN",
      });
    },
  );
});

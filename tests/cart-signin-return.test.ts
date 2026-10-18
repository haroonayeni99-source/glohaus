import { beforeEach, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/accounts/domain";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), database: vi.fn() }));
vi.mock("@/lib/identity", () => ({ getIdentity: mocks.identity }));
vi.mock("@/lib/db", () => ({ withIdentity: mocks.database }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import CartPage from "@/app/cart/page";
import { pageAccount } from "@/lib/page-access";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockRejectedValue(new AccessError("UNAUTHENTICATED", 401));
});
it("preserves the basket destination when the real Cart page requires sign-in", async () => {
  await expect(CartPage()).rejects.toThrow("redirect:/sign-in?returnTo=%2Fcart");
  expect(mocks.database).not.toHaveBeenCalled();
});
it.each(["https://outside.invalid", "//outside.invalid", "/\\outside.invalid"])("rejects an unsafe return address %s", async destination => {
  await expect(pageAccount("customer", destination)).rejects.toThrow("redirect:/sign-in");
});
it("preserves existing redirects on pages that do not supply a destination", async () => {
  await expect(pageAccount("customer")).rejects.toThrow(/^redirect:\/sign-in$/);
  await expect(pageAccount("professional")).rejects.toThrow(/^redirect:\/professional\/sign-in$/);
});

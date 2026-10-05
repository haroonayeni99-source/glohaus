import { beforeEach, describe, expect, it, vi } from "vitest";
import { pageAccount } from "@/lib/page-access";
import { AccessError, type Account } from "@/modules/accounts/domain";

const { getIdentity, withIdentity, findAccount, rpc, redirect } = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  withIdentity: vi.fn(),
  findAccount: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock("@/lib/identity", () => ({ getIdentity }));
vi.mock("@/lib/db", () => ({ withIdentity }));
vi.mock("@/modules/accounts/repository", () => ({ findAccount }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("next/navigation", () => ({ redirect }));

const account: Account = {
  id: "account-id", authId: "auth-id", email: "test@example.test",
  displayName: "Test", status: "active", roles: ["professional"],
  professionalId: "professional-id", restrictedUntil: null, deletedAt: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  getIdentity.mockResolvedValue({ authId: account.authId, email: account.email, displayName: account.displayName, secondFactorAge: null });
  withIdentity.mockImplementation(async (_authId, callback) => callback({}));
  findAccount.mockResolvedValue(account);
  rpc.mockResolvedValue({ data: account, error: null });
});

describe("protected page account fallback", () => {
  it("uses the database account normally without calling the fallback", async () => {
    expect(await pageAccount("professional")).toEqual({ account, error: null });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["08006", "53300", "28P01"])("uses the authenticated RPC on database outage %s", async (code) => {
    withIdentity.mockRejectedValue(Object.assign(new Error("Database unavailable"), { code }));
    expect(await pageAccount("professional")).toEqual({ account, error: null });
    expect(rpc).toHaveBeenCalledWith("glohaus_my_account");
  });
  it.each([
    ["FORBIDDEN", { ...account, authId: "another-user" }],
    ["FORBIDDEN", { ...account, roles: ["customer"] }],
    ["ACCOUNT_INACTIVE", { ...account, status: "suspended" }],
    ["ACCOUNT_INACTIVE", { ...account, restrictedUntil: new Date(Date.now() + 60000).toISOString() }],
    ["ACCOUNT_INACTIVE", { ...account, deletedAt: new Date().toISOString() }],
  ])("still enforces %s on fallback accounts", async (error, data) => {
    withIdentity.mockRejectedValue(new AccessError("UNAVAILABLE", 503));
    rpc.mockResolvedValue({ data, error: null });
    expect(await pageAccount("professional")).toEqual({ account: null, error });
  });
  it("still requires MFA for an admin fallback", async () => {
    withIdentity.mockRejectedValue(new AccessError("UNAVAILABLE", 503));
    rpc.mockResolvedValue({ data: { ...account, roles: ["owner"] }, error: null });
    expect(await pageAccount("admin")).toEqual({ account: null, error: "MFA_REQUIRED" });
  });
  it("does not retry authorization failures through the fallback", async () => {
    findAccount.mockResolvedValue({ ...account, roles: ["customer"] });
    expect(await pageAccount("professional")).toEqual({ account: null, error: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("redirects unauthenticated visitors without looking up an account", async () => {
    getIdentity.mockRejectedValue(new AccessError("UNAUTHENTICATED", 401));
    await expect(pageAccount()).rejects.toThrow("redirect:/sign-in");
    expect(withIdentity).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("redirects missing fallback accounts to onboarding", async () => {
    withIdentity.mockRejectedValue(new AccessError("UNAVAILABLE", 503));
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(pageAccount()).rejects.toThrow("redirect:/onboarding");
  });
});

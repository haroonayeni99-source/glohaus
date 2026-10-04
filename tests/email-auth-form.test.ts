import * as React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EmailAuthForm } from "@/components/email-auth-form";

const mocks = vi.hoisted(() => ({
  setters: [] as ReturnType<typeof vi.fn>[],
  signIn: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  signOut: vi.fn(),
  refreshSession: vi.fn(),
  getSession: vi.fn(),
  push: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    mocks.setters.push(setter);
    return [initial, setter];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mocks.signIn,
      signUp: mocks.signUp,
      resend: mocks.resend,
      signOut: mocks.signOut,
      refreshSession: mocks.refreshSession,
      getSession: mocks.getSession,
    },
  }),
}));
const NativeFormData = globalThis.FormData;
const credentials = new NativeFormData();
credentials.set("email", "test@example.com");
credentials.set("password", "test-password");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.setters.length = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "FormData",
    class {
      constructor() {
        return credentials;
      }
    },
  );
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("window", { setTimeout, location: { origin: "https://www.glohaus.shop", href: "https://www.glohaus.shop/sign-up", } });
});
afterEach(() => vi.unstubAllGlobals());
async function submit(
  mode: "sign-in" | "sign-up",
  audience: "customer" | "professional" = "customer",
) {
  const tree = EmailAuthForm({
    mode,
    audience,
    redirectTo: audience === "professional" ? "/professional" : "/account",
  });
  expect(tree.props.action).toBeUndefined();
  const preventDefault = vi.fn();
  await tree.props.onSubmit({ preventDefault, currentTarget: {} });
  expect(preventDefault).toHaveBeenCalled();
}
describe("email authentication submission", () => {
  it.each(["sign-in", "sign-up"] as const)(
    "recovers from rejected %s requests without redirecting",
    async (mode) => {
      mocks.signIn.mockRejectedValue(new Error("offline"));
      mocks.signUp.mockRejectedValue(new Error("offline"));
      await submit(mode);
      expect(mocks.setters[0]).toHaveBeenLastCalledWith(
        expect.stringContaining("Check your connection"),
      );
      expect(mocks.setters[1]).toHaveBeenLastCalledWith(false);
      expect(mocks.push).not.toHaveBeenCalled();
    },
  );
  it("recovers when internal account provisioning is unavailable", async () => {
    mocks.signIn.mockResolvedValue({
      data: { session: {}, user: {} },
      error: null,
    });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    await submit("sign-in");
    expect(mocks.setters[1]).toHaveBeenLastCalledWith(false);
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("waits for email confirmation without provisioning an unverified account", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await submit("sign-up", "professional");
    expect(mocks.setters[2]).toHaveBeenLastCalledWith("test@example.com");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("sends authenticated professional signups to professional onboarding", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    await submit("sign-up", "professional");
    expect(mocks.push).toHaveBeenCalledWith("/onboarding?intent=professional");
  });
  it("routes a signed-in professional using the server account", async () => {
    mocks.signIn.mockResolvedValue({
      data: { session: {}, user: {} },
      error: null,
    });
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ redirectTo: "/account" }),
    });
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ account: { roles: ["customer", "professional"] } }),
    });
    await submit("sign-in", "professional");
    expect(mocks.push).toHaveBeenCalledWith("/professional");
  });
  it("rejects provider errors without provisioning or navigating", async () => {
    mocks.signIn.mockResolvedValue({ data: { session: null }, error: { message: "Invalid login credentials" } });
    await submit("sign-in");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.setters[0]).toHaveBeenLastCalledWith("Invalid login credentials");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("refreshes the cookie session once before retrying account provisioning", async () => {
    mocks.signIn.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: {} }, error: null });
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ redirectTo: "/account" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ account: { roles: ["customer"] } }) });
    await submit("sign-in");
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.push).toHaveBeenCalledWith("/account");
  });
  it("stops after unsuccessful session repair instead of granting account access", async () => {
    mocks.signIn.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "Expired" } });
    mocks.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await submit("sign-in");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.setters[0]).toHaveBeenLastCalledWith(expect.stringContaining("sign in again"));
  });

});

import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

const mocks = vi.hoisted(() => ({
  reset: vi.fn(),
  setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    mocks.setters.push(setter);
    return [initial, setter];
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { resetPasswordForEmail: mocks.reset } }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.setters.length = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    location: { href: "https://www.glohaus.shop/forgot-password" },
  });
});
afterEach(() => vi.unstubAllGlobals());

async function submit() {
  const form = ForgotPasswordForm();
  const data = new FormData();
  data.set("email", "customer@example.test");
  await form.props.action(data);
}

it("allows retry after a rejected reset request without claiming an email was sent", async () => {
  mocks.reset.mockRejectedValue(new Error("offline: private diagnostics"));
  await expect(submit()).resolves.toBeUndefined();
  expect(mocks.setters[0]).toHaveBeenLastCalledWith(false);
  expect(mocks.setters[1]).not.toHaveBeenCalled();
  expect(mocks.setters[2]).toHaveBeenLastCalledWith(null);
  expect(mocks.setters[3]).toHaveBeenLastCalledWith(
    expect.stringContaining("Check your connection"),
  );
  expect(mocks.setters[3]).not.toHaveBeenCalledWith(
    expect.stringContaining("private diagnostics"),
  );
});

it("keeps rate-limit feedback and clears pending state", async () => {
  mocks.reset.mockResolvedValue({
    error: { status: 429, message: "rate limit" },
  });
  await submit();
  expect(mocks.setters[0]).toHaveBeenLastCalledWith(false);
  expect(mocks.setters[1]).not.toHaveBeenCalled();
  expect(mocks.setters[3]).toHaveBeenLastCalledWith(
    expect.stringContaining("Too many reset emails"),
  );
});

it("uses the current production host and announces only the privacy-safe provider result", async () => {
  mocks.reset.mockResolvedValue({ error: null });
  await submit();
  expect(mocks.reset).toHaveBeenCalledWith("customer@example.test", {
    redirectTo: "https://www.glohaus.shop/auth/callback?next=%2Freset-password",
  });
  expect(mocks.setters[0]).toHaveBeenLastCalledWith(false);
  expect(mocks.setters[1]).toHaveBeenLastCalledWith(true);
  expect(mocks.setters[2]).toHaveBeenLastCalledWith(
    expect.stringContaining("If an account exists"),
  );
});

it("sends an isolated reset request back to its own preview", async () => {
  vi.stubGlobal("window", { location: { href: "https://validation.vercel.app/forgot-password" } });
  mocks.reset.mockResolvedValue({ error: null });
  const form = ForgotPasswordForm({ isolatedPreview: true });
  const data = new FormData();
  data.set("email", "customer@example.test");
  await form.props.action(data);
  expect(mocks.reset).toHaveBeenCalledWith("customer@example.test", {
    redirectTo: "https://validation.vercel.app/auth/callback?next=%2Freset-password",
  });
});

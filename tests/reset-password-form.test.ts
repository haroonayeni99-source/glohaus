// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "@/components/reset-password-form";

const mocks = vi.hoisted(() => ({ session: vi.fn(), update: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: {
    getSession: mocks.session,
    updateUser: mocks.update,
    signOut: mocks.signOut,
  } }),
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.session.mockResolvedValue({ data: { session: {} }, error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(recoveryAllowed = true) {
  await act(async () => root.render(React.createElement(ResetPasswordForm, { recoveryAllowed })));
}
async function submit() {
  host.querySelector<HTMLInputElement>('[name="password"]')!.value = "fixture-new-password";
  host.querySelector<HTMLInputElement>('[name="confirmPassword"]')!.value = "fixture-new-password";
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
it("finishes session checking with an actionable retry after a network rejection", async () => {
  mocks.session.mockRejectedValue(new Error("private session diagnostics"));
  await render();
  expect(host.textContent).toContain("We couldn’t check your reset link");
  expect(host.textContent).not.toContain("Checking reset link…");
  expect(host.textContent).not.toContain("Reset link expired");
  expect(host.textContent).not.toContain("private session diagnostics");
  expect(host.querySelector("button")?.textContent).toBe("Try again");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("clears pending state without claiming success when the password request rejects", async () => {
  mocks.update.mockRejectedValue(new Error("private update diagnostics"));
  await render();
  await submit();
  expect(host.querySelector("[role=alert]")?.textContent).toContain("couldn’t confirm the password update");
  expect(host.querySelector("button")?.disabled).toBe(false);
  expect(host.textContent).not.toContain("Password updated");
  expect(host.textContent).not.toContain("private update diagnostics");
  expect(mocks.signOut).not.toHaveBeenCalled();
});
it.each(["rejected", "provider-error"])("reports a completed password change accurately after %s sign-out", async (mode) => {
  if (mode === "rejected") mocks.signOut.mockRejectedValue(new Error("offline"));
  else mocks.signOut.mockResolvedValue({ error: { message: "offline" } });
  await render();
  await submit();
  expect(mocks.update).toHaveBeenCalledWith({ password: "fixture-new-password" });
  expect(host.querySelector("h1")?.textContent).toBe("Password updated");
  expect(host.querySelector("[role=alert]")?.textContent).toContain("couldn’t finish signing out");
  expect(host.querySelector("form")).toBeNull();
});
it("keeps password changes unavailable without the server recovery permission", async () => {
  await render(false);
  expect(host.textContent).toContain("Reset link expired");
  expect(host.querySelector("form")).toBeNull();
  expect(mocks.update).not.toHaveBeenCalled();
});

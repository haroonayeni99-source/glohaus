// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MfaManager } from "@/components/mfa-manager";

const mocks = vi.hoisted(() => ({
  level: "aal2",
  challenge: vi.fn(),
  verify: vi.fn(),
  refreshSession: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      refreshSession: mocks.refreshSession,
      mfa: {
        listFactors: async () => ({
          data: { totp: [{ id: "fixture-factor", status: "verified" }] },
        }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: mocks.level, nextLevel: "aal2" },
        }),
        challenge: mocks.challenge,
        verify: mocks.verify,
      },
    },
  }),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.level = "aal2";
  mocks.challenge.mockResolvedValue({ data: { id: "fixture-challenge" } });
  mocks.verify.mockResolvedValue({ data: {} });
  mocks.refreshSession.mockResolvedValue({ data: {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(React.createElement(MfaManager)));
  await act(async () => vi.runAllTimersAsync());
}
it("lets an already aal2 session request a fresh challenge without claiming Admin access or weakening the existing MFA flow", async () => {
  await render();
  expect(container.textContent).toContain(
    "may require a fresh authenticator check",
  );
  expect(
    container.querySelector('input[autocomplete="one-time-code"]'),
  ).toBeNull();
  await act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent === "Verify again for Admin")!
      .click(),
  );
  expect(
    container.querySelector('input[autocomplete="one-time-code"]'),
  ).not.toBeNull();
  expect(
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Verify and open Admin",
    )?.disabled,
  ).toBe(true);
  expect(mocks.challenge).not.toHaveBeenCalled();
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.refreshSession).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("keeps the existing initial MFA challenge visible for aal1 sessions", async () => {
  mocks.level = "aal1";
  await render();
  expect(
    container.querySelector('input[autocomplete="one-time-code"]'),
  ).not.toBeNull();
  expect(container.textContent).not.toContain("Verify again for Admin");
  expect(mocks.replace).not.toHaveBeenCalled();
});

// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AuthSessionProvider } from "@/components/auth-session";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AccountControls } from "@/components/account-controls";
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  signOut: vi.fn(),
  finish: vi.fn(),
  unsubscribe: vi.fn(),
  listener: undefined as
    | undefined
    | ((event: string, session: { user: { id: string } } | null) => void),
}));
const router = { refresh: mocks.refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: (props: object) => React.createElement("a", props),
}));
vi.mock("@/lib/session-navigation", () => ({ finishSignOut: mocks.finish }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: mocks.signOut,
      onAuthStateChange: (listener: typeof mocks.listener) => {
        mocks.listener = listener;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
    },
  }),
}));
let root: Root;
let container: HTMLDivElement;
async function render(initialSignedIn: boolean, hint = !initialSignedIn) {
  await act(async () =>
    root.render(
      React.createElement(
        AuthSessionProvider,
        { initialSignedIn },
        React.createElement(
          React.Fragment,
          null,
          React.createElement(PublicHeader, { signedIn: hint }),
          React.createElement(BottomNavigation, { signedIn: hint }),
          React.createElement(AccountControls),
        ),
      ),
    ),
  );
}
async function event(name: string, id: string | null) {
  await act(async () => mocks.listener!(name, id ? { user: { id } } : null));
}
const link = (text: string) =>
  [...container.querySelectorAll("a")].find((a) => a.textContent === text);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.signOut.mockResolvedValue({ error: null });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("uses the verified shared session even when a page defaults to signed out", async () => {
  await render(true);
  expect(link("My account")?.getAttribute("href")).toBe("/account");
  expect(link("Sign in")).toBeUndefined();
  expect(
    container
      .querySelector(".glohaus-bottom-nav a:last-child")
      ?.getAttribute("href"),
  ).toBe("/workspace");
  expect(container.querySelector("button")?.textContent).toBe("Sign out");
});
it("overrides stale signed-in props after signing out", async () => {
  await render(false);
  expect(link("Sign in")).toBeTruthy();
  expect(container.querySelector("button")).toBeNull();
  expect(
    container
      .querySelector(".glohaus-bottom-nav a:last-child")
      ?.getAttribute("href"),
  ).toContain("/sign-in?returnTo=");
});
it("synchronizes login, logout and user changes without refreshing on repeated token events", async () => {
  await render(false);
  await event("INITIAL_SESSION", null);
  expect(mocks.refresh).not.toHaveBeenCalled();
  await event("SIGNED_IN", "first");
  expect(link("My account")).toBeTruthy();
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  await event("SIGNED_IN", "first");
  await event("TOKEN_REFRESHED", "first");
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  await event("SIGNED_IN", "second");
  expect(mocks.refresh).toHaveBeenCalledTimes(2);
  await event("SIGNED_OUT", null);
  expect(link("Sign in")).toBeTruthy();
  expect(container.querySelector("button")).toBeNull();
  expect(mocks.refresh).toHaveBeenCalledTimes(3);
  await event("SIGNED_OUT", null);
  expect(mocks.refresh).toHaveBeenCalledTimes(3);
});
it("recovers a valid browser session when the initial server display is stale", async () => {
  await render(false);
  await event("INITIAL_SESSION", "first");
  expect(link("My account")).toBeTruthy();
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("waits for sign-out before replacing the document, and allows retry on failure", async () => {
  await render(true);
  mocks.signOut.mockResolvedValueOnce({ error: new Error("Offline") });
  await act(async () => container.querySelector("button")!.click());
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(container.querySelector("[role=alert]")?.textContent).toContain(
    "could not sign you out",
  );
  expect(container.querySelector("button")?.disabled).toBe(false);
  await act(async () => container.querySelector("button")!.click());
  expect(mocks.finish).toHaveBeenCalledOnce();
});

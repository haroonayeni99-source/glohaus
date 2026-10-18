// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({
  default: (props: object) => React.createElement("a", props),
}));
let root: Root, container: HTMLDivElement;
let Shell: typeof import("@/components/pwa-shell").PwaShell;
let Button: typeof import("@/components/pwa-shell").InstallButton;
let standalone = false;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("isSecureContext", true);
  nav.pathname = "/";
  standalone = false;
  localStorage.clear();
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "iPhone Safari",
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: standalone,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const worker = new EventTarget();
  Object.assign(worker, {
    register: vi
      .fn()
      .mockResolvedValue({
        waiting: null,
        installing: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: worker,
  });
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: vi.fn(),
  });
  ({ PwaShell: Shell, InstallButton: Button } =
    await import("@/components/pwa-shell"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("offers manual iPhone guidance without requesting notification permission and persists dismissal", async () => {
  await act(async () => root.render(React.createElement(Shell)));
  expect(container.textContent).toContain("iPhone installation steps");
  expect(Notification.requestPermission).not.toHaveBeenCalled();
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".pwa-dismiss")!.click(),
  );
  expect(container.querySelector(".pwa-notice")).toBeNull();
  expect(
    Number(localStorage.getItem("glohaus-install-dismissed-until")),
  ).toBeGreaterThan(Date.now());
  await act(async () => {
    root.unmount();
    root = createRoot(container);
    root.render(React.createElement(Shell));
  });
  expect(container.querySelector(".pwa-notice")).toBeNull();
});
it("hides install offers in standalone windows and on checkout or authentication pages", async () => {
  standalone = true;
  await act(async () => root.render(React.createElement(Shell)));
  expect(container.querySelector(".pwa-notice")).toBeNull();
  standalone = false;
  nav.pathname = "/account/bookings/fixture";
  await act(async () => root.render(React.createElement(Shell)));
  expect(container.querySelector(".pwa-notice")).toBeNull();
  nav.pathname = "/auth/callback";
  await act(async () => root.render(React.createElement(Shell)));
  expect(container.querySelector(".pwa-notice")).toBeNull();
});
it("uses an Android browser install event once and only after the install button is pressed", async () => {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Android Chrome",
  });
  await act(async () =>
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Shell),
        React.createElement(Button),
      ),
    ),
  );
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  await act(async () => {
    window.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Install GLOHAUS",
  )!;
  await act(async () => button.click());
  expect(prompt).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Installation dismissed");
  expect(
    Array.from(container.querySelectorAll("button")).some(
      (b) => b.textContent === "Install GLOHAUS",
    ),
  ).toBe(false);
});
it("requires Home Screen launch for iOS push even if browser push APIs exist", async () => {
  vi.stubGlobal("PushManager", class {});
  const { pushBrowserState } = await import("@/lib/pwa-client");
  expect(pushBrowserState()).toBe("install-first:default");
  standalone = true;
  expect(pushBrowserState()).toBe("supported:default");
});

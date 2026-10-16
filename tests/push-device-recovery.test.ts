// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ProfessionalNotificationSettings } from "@/components/professional-notification-settings";

vi.mock("next/link", () => ({
  default: (props: object) => React.createElement("a", props),
}));

let root: Root, container: HTMLDivElement;
const unsubscribe = vi.fn();
const getSubscription = vi.fn();
const subscribe = vi.fn();
const subscription = {
  options: {},
  unsubscribe,
  toJSON: () => ({
    endpoint: "https://fcm.googleapis.com/fcm/send/device",
    keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    permission: "granted",
    requestPermission: vi.fn().mockResolvedValue("granted"),
  });
  const registration = { pushManager: { getSubscription, subscribe } };
  vi.stubGlobal("navigator", {
    userAgent: "Desktop browser",
    serviceWorker: {
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    },
  });
  unsubscribe.mockResolvedValue(true);
  getSubscription.mockResolvedValue(subscription);
  subscribe.mockResolvedValue(subscription);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({}, { status: 503 })),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function enable() {
  await act(async () =>
    root.render(
      React.createElement(ProfessionalNotificationSettings, {
        initial: { preferences: [], devices: [] },
        pushConfigured: true,
        publicKey: "AQID",
      }),
    ),
  );
  const button = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Enable this device",
  )!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}

it("preserves an existing working browser subscription when registration fails", async () => {
  await enable();
  expect(fetch).toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(container.querySelector("[role=alert]")?.textContent).toContain(
    "Could not update this device",
  );
});

it("cleans up a newly created subscription when the server cannot save it", async () => {
  getSubscription.mockResolvedValue(null);
  await enable();
  expect(subscribe).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(container.querySelector("[role=alert]")?.textContent).toContain(
    "Could not update this device",
  );
});

it("keeps the useful registration error if cleanup also fails", async () => {
  getSubscription.mockResolvedValue(null);
  unsubscribe.mockRejectedValue(new Error("Browser cleanup failed"));
  await enable();
  expect(container.querySelector("[role=alert]")?.textContent).toContain(
    "Could not update this device",
  );
});

it("keeps a saved device enabled when only reloading its settings fails", async () => {
  getSubscription.mockResolvedValue(null);
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ id: "saved-device" }))
    .mockResolvedValueOnce(Response.json({}, { status: 503 }));
  await enable();
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(container.querySelector("[role=alert]")?.textContent).toContain(
    "Could not reload settings",
  );
});

// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ProfessionalNotificationBell } from "@/components/professional-notification-bell";
import { NotificationInbox } from "@/components/notification-inbox";
vi.mock("next/link", () => ({
  default: (props: object) => React.createElement("a", props),
}));
class FakeSource extends EventTarget {
  static instances: FakeSource[] = [];
  close = vi.fn();
  constructor(public url: string) {
    super();
    FakeSource.instances.push(this);
  }
}
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", FakeSource);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ saved: true })),
  );
  FakeSource.instances = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("shares one live connection between bell and inbox, updates unread count and renders real snapshot links", async () => {
  await act(async () =>
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(ProfessionalNotificationBell),
        React.createElement(NotificationInbox, {
          professional: true,
          initialNotifications: [],
        }),
      ),
    ),
  );
  expect(FakeSource.instances).toHaveLength(1);
  await act(async () =>
    FakeSource.instances[0].dispatchEvent(
      new MessageEvent("notifications", {
        data: JSON.stringify({
          unread: 123,
          notifications: [
            {
              id: "real-event",
              kind: "customer_message",
              title: "New customer message",
              body: "Open your inbox to reply.",
              href: "/messages?thread=conversation&view=professional",
              read_at: null,
              created_at: "2026-10-15T12:00:00Z",
            },
          ],
        }),
      }),
    ),
  );
  expect(
    container.querySelector('a[aria-label="Notifications, 123 unread"]')
      ?.textContent,
  ).toContain("99+");
  expect(
    container.querySelector(
      'a[href="/messages?thread=conversation&view=professional"]',
    )?.textContent,
  ).toContain("New customer message");
  const mark = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Mark New customer message as read"]',
  )!;
  await act(async () => mark.click());
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/notifications",
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(container.querySelector("article")?.getAttribute("data-read")).toBe(
    "true",
  );
});
it("closes the private live stream and clears unread count when signing out", async () => {
  await act(async () =>
    root.render(React.createElement(ProfessionalNotificationBell)),
  );
  await act(async () =>
    window.dispatchEvent(
      new CustomEvent("glohaus:identity-change", {
        detail: { signedIn: false },
      }),
    ),
  );
  expect(FakeSource.instances[0].close).toHaveBeenCalled();
});

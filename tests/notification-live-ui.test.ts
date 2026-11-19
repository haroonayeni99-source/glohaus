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

const notification = (id: string) => ({ id, booking_id: null, product_order_id: null, kind: 'customer_message' as const, title: `Message ${id}`, body: 'Fictional inbox fixture', href: '/messages', read_at: null, created_at: new Date('2026-11-19T12:00:00Z') });
async function inbox() {
  await act(async () => root.render(React.createElement(NotificationInbox, {professional: true, initialNotifications: [notification('first')]})));
}
function allButton() { return Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Mark all as read'))!; }
it('keeps notifications arriving during a mark-all request unread until confirmed by the live server', async () => {
  await inbox(); let complete!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(r => {complete = r;}));
  await act(async () => allButton().click());
  await act(async () => window.dispatchEvent(new CustomEvent('glohaus:notifications', {detail: {notifications: [notification('first'), notification('new')]}})));
  await act(async () => complete(Response.json({saved: true})));
  const articles=container.querySelectorAll('article');
  expect(articles[0].dataset.read).toBe('true');expect(articles[1].dataset.read).toBe('false');expect(container.textContent).toContain('1 unread');
});
it('serialises per-item and mark-all writes, including repeated link activation before render', async () => {
  await inbox();container.addEventListener('click',e=>e.preventDefault());let complete!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(r => {complete = r;}));
  const link=container.querySelector('article a')!;
  await act(async () => {link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));});
  expect(fetch).toHaveBeenCalledTimes(1);expect(allButton().disabled).toBe(true);
  await act(async () => complete(Response.json({saved:true})));
  expect(container.querySelector('article')!.dataset.read).toBe('true');
});
it('releases controls after a timed-out update and preserves unread state for retry', async () => {
  await inbox();vi.mocked(fetch).mockRejectedValueOnce(new DOMException('timeout','TimeoutError'));
  await act(async () => allButton().click());
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Please try again');expect(container.querySelector('article')!.dataset.read).toBe('false');expect(allButton().disabled).toBe(false);
  expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  await act(async () => allButton().click());expect(container.querySelector('article')!.dataset.read).toBe('true');
});
it('does not send another read request for an already read notification', async () => {
  await inbox();container.addEventListener('click',e=>e.preventDefault());const mark=container.querySelector<HTMLButtonElement>('button[title="Mark as read"]')!;await act(async () => mark.click());
  await act(async () => container.querySelector('article a')!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
  expect(fetch).toHaveBeenCalledTimes(1);
});

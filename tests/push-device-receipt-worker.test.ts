import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

async function harness() {
  const listeners: Record<string, (event: unknown) => void> = {},
    fetch = vi.fn().mockResolvedValue({ ok: true }),
    show = vi.fn().mockResolvedValue(undefined),
    open = vi.fn().mockResolvedValue(undefined);
  const self = {
    addEventListener: (kind: string, fn: (event: unknown) => void) => {
      listeners[kind] = fn;
    },
    registration: { showNotification: show },
    location: { origin: "https://glohaus.test" },
    clients: { matchAll: async () => [], openWindow: open },
  };
  vm.runInNewContext(
    await readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self, fetch, URL },
  );
  return { listeners, fetch, show, open };
}
it("records device display only after showNotification succeeds and reports click independently", async () => {
  const h = await harness();
  let pending: Promise<unknown> | undefined;
  h.listeners.push({
    data: {
      json: () => ({
        href: "/account/bookings/fixture",
        deliveryReceipt: "scoped-token",
      }),
    },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  expect(h.show).toHaveBeenCalledOnce();
  expect(h.fetch).toHaveBeenCalledWith(
    "/api/v1/notifications/push-receipt",
    expect.objectContaining({
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({ token: "scoped-token", kind: "displayed" }),
    }),
  );
  h.listeners.notificationclick({
    notification: {
      close: () => {},
      data: {
        href: "/account/bookings/fixture",
        deliveryReceipt: "scoped-token",
      },
    },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  expect(h.open).toHaveBeenCalledWith(
    "https://glohaus.test/account/bookings/fixture",
  );
  expect(h.fetch.mock.calls[1][1].body).toContain('"clicked"');
});
it("does not report display when the device rejects displaying the notification", async () => {
  const h = await harness();
  h.show.mockRejectedValue(new Error("permission denied"));
  let pending: Promise<unknown> | undefined;
  h.listeners.push({
    data: {
      json: () => ({
        href: "/account/bookings/fixture",
        deliveryReceipt: "scoped-token",
      }),
    },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await expect(pending).rejects.toThrow("permission denied");
  expect(h.fetch).not.toHaveBeenCalled();
});

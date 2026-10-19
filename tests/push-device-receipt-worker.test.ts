import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

async function harness() {
  const listeners: Record<string, (event: unknown) => void> = {},
    fetch = vi.fn().mockResolvedValue({ ok: true }),
    show = vi.fn().mockResolvedValue(undefined),
    open = vi.fn().mockResolvedValue(undefined),
    matchAll = vi.fn().mockResolvedValue([]);
  const self = {
    addEventListener: (kind: string, fn: (event: unknown) => void) => {
      listeners[kind] = fn;
    },
    registration: { showNotification: show },
    location: { origin: "https://glohaus.test" },
    clients: { matchAll, openWindow: open },
  };
  vm.runInNewContext(
    await readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self, fetch, URL },
  );
  return { listeners, fetch, show, open, matchAll };
}
function click(
  h: Awaited<ReturnType<typeof harness>>,
  href = "/account/bookings/fixture",
) {
  let pending: Promise<unknown> | undefined;
  h.listeners.notificationclick({
    notification: {
      close: vi.fn(),
      data: { href, deliveryReceipt: "scoped-token" },
    },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  return pending!;
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
it("foregrounds an existing app before waiting for its destination navigation", async () => {
  const h = await harness(),
    order: string[] = [];
  const client = {
    url: "https://glohaus.test/account",
    focus: vi.fn(),
    navigate: vi.fn(),
  };
  client.focus.mockImplementation(async () => {
    order.push("focus");
    return client;
  });
  client.navigate.mockImplementation(async () => {
    order.push("navigate");
    return client;
  });
  h.matchAll.mockResolvedValue([client]);
  await click(h);
  expect(order).toEqual(["focus", "navigate"]);
  expect(client.navigate).toHaveBeenCalledWith(
    "https://glohaus.test/account/bookings/fixture",
  );
  expect(h.open).not.toHaveBeenCalled();
});
it("prefers the destination client and reloads its target after SPA navigation", async () => {
  const h = await harness();
  const unrelated = {
    url: "https://glohaus.test/checkout",
    focus: vi.fn(),
    navigate: vi.fn(),
  };
  const destination = {
    url: "https://glohaus.test/account/bookings/fixture",
    focus: vi.fn(),
    navigate: vi.fn(),
  };
  destination.focus.mockResolvedValue(destination);
  destination.navigate.mockResolvedValue(destination);
  h.matchAll.mockResolvedValue([unrelated, destination]);
  await click(h);
  expect(destination.focus).toHaveBeenCalledOnce();
  expect(destination.navigate).toHaveBeenCalledExactlyOnceWith(
    "https://glohaus.test/account/bookings/fixture",
  );
  expect(unrelated.focus).not.toHaveBeenCalled();
  expect(unrelated.navigate).not.toHaveBeenCalled();
  expect(h.open).not.toHaveBeenCalled();
});
it("recovers from a closed client and focuses the newly opened app", async () => {
  const h = await harness();
  const stale = {
    url: "https://glohaus.test/account",
    focus: vi.fn(),
    navigate: vi.fn().mockRejectedValue(new Error("window closed")),
  };
  stale.focus.mockResolvedValue(stale);
  const opened = { focus: vi.fn().mockResolvedValue(undefined) };
  h.matchAll.mockResolvedValue([stale]);
  h.open.mockResolvedValue(opened);
  await click(h);
  expect(h.open).toHaveBeenCalledExactlyOnceWith(
    "https://glohaus.test/account/bookings/fixture",
  );
  expect(opened.focus).toHaveBeenCalledOnce();
});
it("tries another client when Android rejects focusing a suspended window", async () => {
  const h = await harness();
  const suspended = {
    url: "https://glohaus.test/",
    focus: vi.fn().mockRejectedValue(new Error("InvalidAccessError")),
    navigate: vi.fn(),
  };
  const active = {
    url: "https://glohaus.test/account",
    focus: vi.fn(),
    navigate: vi.fn(),
  };
  active.focus.mockResolvedValue(active);
  active.navigate.mockResolvedValue(active);
  h.matchAll.mockResolvedValue([suspended, active]);
  await click(h);
  expect(suspended.navigate).not.toHaveBeenCalled();
  expect(active.focus).toHaveBeenCalledOnce();
  expect(active.navigate).toHaveBeenCalledOnce();
  expect(h.open).not.toHaveBeenCalled();
});
it.each(["focus-rejected", "navigate-null", "enumeration-rejected"])(
  "opens the destination after %s instead of losing the tap",
  async (failure) => {
    const h = await harness();
    const client = {
      url: "https://glohaus.test/account",
      focus: vi.fn(),
      navigate: vi.fn().mockResolvedValue(null),
    };
    client.focus.mockResolvedValue(client);
    if (failure === "focus-rejected")
      client.focus.mockRejectedValue(new Error("InvalidAccessError"));
    if (failure === "enumeration-rejected")
      h.matchAll.mockRejectedValue(new Error("client list unavailable"));
    else h.matchAll.mockResolvedValue([client]);
    await click(h);
    expect(h.open).toHaveBeenCalledExactlyOnceWith(
      "https://glohaus.test/account/bookings/fixture",
    );
  },
);
it("opens without waiting for the receipt and tolerates a rejected follow-up focus", async () => {
  const h = await harness();
  let finish!: () => void;
  h.fetch.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  h.open.mockResolvedValue({
    focus: vi.fn().mockRejectedValue(new Error("already open")),
  });
  const pending = click(h);
  await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
  finish();
  await pending;
});
it.each(["//attacker.test/", "/\\attacker.test/", "https://attacker.test/"])(
  "opens only a same-origin fallback for malformed notification URL %s",
  async (href) => {
    const h = await harness();
    h.matchAll.mockResolvedValue([
      { url: "https://attacker.test/", focus: vi.fn() },
      { url: "invalid", focus: vi.fn() },
    ]);
    await click(h, href);
    expect(h.open).toHaveBeenCalledExactlyOnceWith(
      "https://glohaus.test/notifications?view=professional",
    );
  },
);

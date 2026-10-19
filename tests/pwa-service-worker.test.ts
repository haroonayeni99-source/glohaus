import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { expect, it, vi } from "vitest";
const origin = "https://www.glohaus.shop";
async function harness() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(new Response("<h1>You’re offline.</h1>")),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi
      .fn()
      .mockResolvedValue([
        "glohaus-pwa-static-v0",
        "unrelated-cache",
        "glohaus-pwa-static-v1",
        "glohaus-pwa-static-v2",
      ]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response("Current live page"));
  const self = {
    location: { origin },
    addEventListener: (kind: string, fn: (event: unknown) => void) => {
      listeners[kind] = fn;
    },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
  };
  class BrowserRequest extends Request {
    constructor(url: string, options?: RequestInit) {
      super(new URL(url, origin), options);
    }
  }
  vm.runInNewContext(
    await readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self, caches, fetch, URL, Request: BrowserRequest, Response },
  );
  async function lifecycle(kind: string, props = {}) {
    let promise;
    listeners[kind]({
      ...props,
      waitUntil: (p: Promise<unknown>) => {
        promise = p;
      },
    });
    await promise;
  }
  async function request(path: string, options = {}) {
    let promise: Promise<Response> | undefined;
    listeners.fetch({
      request: {
        method: "GET",
        mode: "navigate",
        url: `${origin}${path}`,
        ...options,
      },
      respondWith: (p: Promise<Response>) => {
        promise = p;
      },
    });
    return promise ? await promise : undefined;
  }
  return { listeners, lifecycle, request, cache, caches, fetch, self };
}
it("precaches only the static help screen and exact icons, omitting credentials", async () => {
  const h = await harness();
  await h.lifecycle("install");
  const requests = h.cache.addAll.mock.calls[0][0];
  expect(requests.map((r: Request) => new URL(r.url).pathname)).toEqual([
    "/offline.html",
    "/icons/glohaus-192.png",
    "/icons/glohaus-512.png",
    "/icons/apple-touch-icon.png",
    "/icons/glohaus-maskable-512.png",
    "/icons/glohaus-home-192-v2.png",
    "/icons/glohaus-home-512-v2.png",
    "/icons/glohaus-home-apple-180-v2.png",
    "/icons/glohaus-home-maskable-512-v2.png",
  ]);
  expect(
    requests.every(
      (r: Request) => r.credentials === "omit" && r.cache === "reload",
    ),
  ).toBe(true);
  expect(h.self.skipWaiting).not.toHaveBeenCalled();
});
it("deletes only its old static caches and activates updates only on a same-origin request", async () => {
  const h = await harness();
  await h.lifecycle("activate");
  expect(h.caches.delete.mock.calls).toEqual([
    ["glohaus-pwa-static-v0"],
    ["glohaus-pwa-static-v1"],
  ]);
  await h.lifecycle("message", {
    data: { type: "GLOHAUS_ACTIVATE_UPDATE" },
    source: { url: "https://attacker.test/" },
  });
  expect(h.self.skipWaiting).not.toHaveBeenCalled();
  await h.lifecycle("message", {
    data: { type: "GLOHAUS_ACTIVATE_UPDATE" },
    source: { url: `${origin}/` },
  });
  expect(h.self.skipWaiting).toHaveBeenCalledOnce();
});
it("fetches authenticated pages live without writing them into a cache", async () => {
  const h = await harness();
  const response = await h.request("/account/bookings/private?payment=return");
  expect(await response?.text()).toBe("Current live page");
  expect(h.caches.open).not.toHaveBeenCalled();
  h.fetch.mockResolvedValue(new Response("Live server error", { status: 503 }));
  const failure = await h.request("/professional");
  expect(failure?.status).toBe(503);
  expect(await failure?.text()).toBe("Live server error");
});
it("returns a private 503 offline screen only on failed document navigation", async () => {
  const h = await harness();
  h.fetch.mockRejectedValue(new Error("offline"));
  const response = await h.request("/account/bookings/private");
  expect(response?.status).toBe(503);
  expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response?.text()).toContain("offline");
});
it("does not intercept API, RSC, payment POSTs, media, map tiles or external redirects", async () => {
  const h = await harness();
  for (const [path, options] of [
    ["/api/v1/bookings/private", {}],
    ["/account?_rsc=123", { mode: "cors" }],
    ["/api/v1/payments", { method: "POST" }],
    ["/media/private.jpg", { mode: "cors" }],
    ["/icons/glohaus-192.png?private=1", { mode: "cors" }],
    ["/", { url: "https://checkout.stripe.com/c/pay/fixture" }],
    ["/", { url: "https://maps.google.com/fixture", mode: "cors" }],
  ] as const)
    expect(await h.request(path, options)).toBeUndefined();
  expect(h.fetch).not.toHaveBeenCalled();
  expect(h.caches.open).not.toHaveBeenCalled();
});

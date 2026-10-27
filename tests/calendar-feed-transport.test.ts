import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import type { LookupFunction } from "node:net";
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:https", async (original) => {
  const actual = await original<typeof import("node:https")>();
  return { ...actual, default: { ...actual, get: network.get } };
});
import https from "node:https";
import { fetchFeed, feedUrl } from "@/modules/business-tools/ics";
class ResponseStream extends EventEmitter {
  statusCode = 200;
  resume = vi.fn();
  destroy = vi.fn((error?: Error) => {
    if (error) this.emit("error", error);
    return this;
  });
}
let response: ResponseStream, request: EventEmitter;
beforeEach(() => {
  response = new ResponseStream();
  request = new EventEmitter();
  network.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  network.get.mockImplementation(
    (
      _url: URL,
      _options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      queueMicrotask(() => callback(response as unknown as IncomingMessage));
      return request;
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
async function connected() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
describe("calendar subscription transport", () => {
  it("pins the validated public address, preserves host/TLS checks and avoids the global proxy agent", async () => {
    const promise = fetchFeed("https://calendar.example.test/private.ics");
    await connected();
    const [url, options] = network.get.mock.calls[0] as [URL, RequestOptions];
    expect(url.hostname).toBe("calendar.example.test");
    expect(options.agent).toBeInstanceOf(https.Agent);
    expect(options.agent).not.toBe(https.globalAgent);
    expect(options.rejectUnauthorized).not.toBe(false);
    expect(options.family).toBe(4);
    const callback = vi.fn();
    (options.lookup as LookupFunction)("calendar.example.test", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    response.emit("data", Buffer.from("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"));
    response.emit("end");
    expect(await promise).toContain("BEGIN:VCALENDAR");
  });
  it("rejects mixed public/private DNS results before making any request", async () => {
    network.lookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      fetchFeed("https://calendar.example.test/private.ics"),
    ).rejects.toThrow("FEED_UNSUPPORTED");
    expect(network.get).not.toHaveBeenCalled();
  });
  it("rejects IPv6 literals before DNS or HTTPS", async () => {
    expect(() => feedUrl("https://[::1]/private.ics")).toThrow(
      "FEED_UNSUPPORTED",
    );
    await expect(
      fetchFeed("https://[2001:4860:4860::8888]/private.ics"),
    ).rejects.toThrow("FEED_UNSUPPORTED");
    expect(network.lookup).not.toHaveBeenCalled();
  });
  it("rejects redirects without following them and closes its agent", async () => {
    response.statusCode = 302;
    const destroyed = vi.spyOn(https.Agent.prototype, "destroy");
    await expect(
      fetchFeed("https://calendar.example.test/private.ics"),
    ).rejects.toThrow("SYNC_FAILED");
    expect(network.get).toHaveBeenCalledOnce();
    expect(destroyed).toHaveBeenCalled();
  });
  it("rejects oversized feeds and destroys the response", async () => {
    const promise = fetchFeed("https://calendar.example.test/private.ics");
    const rejected = expect(promise).rejects.toThrow("FEED_UNSUPPORTED");
    await connected();
    response.emit("data", Buffer.alloc(2 * 1024 * 1024 + 1));
    await rejected;
    expect(response.destroy).toHaveBeenCalled();
  });
  it("rejects a truncated response instead of accepting a partial calendar", async () => {
    const promise = fetchFeed("https://calendar.example.test/private.ics"),
      rejected = expect(promise).rejects.toThrow("SYNC_FAILED");
    await connected();
    response.emit("data", Buffer.from("BEGIN:VCALENDAR\r\n"));
    response.emit("aborted");
    await rejected;
  });
  it("cleans up after a failed request and bounds the request lifetime", async () => {
    const destroyed = vi.spyOn(https.Agent.prototype, "destroy"),
      promise = fetchFeed("https://calendar.example.test/private.ics"),
      rejected = expect(promise).rejects.toThrow("SYNC_FAILED");
    await connected();
    expect(network.get.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    request.emit("error", Error("fixture socket failure"));
    await rejected;
    expect(destroyed).toHaveBeenCalled();
  });
});

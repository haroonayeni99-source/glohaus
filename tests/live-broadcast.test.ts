// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LiveBroadcast } from "@/components/live-broadcast";

vi.mock("livekit-client", () => ({
  Room: class {
    on() { return this; }
    connect() { return Promise.reject(new Error("Connection failed")); }
    disconnect() { return Promise.resolve(); }
    removeAllListeners() {}
  },
  RoomEvent: {},
  Track: { Kind: { Video: "video" } },
  createLocalTracks: async () => [],
}));

it("keeps failed-session recovery visible until the host successfully ends it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      session: { id: "session", title: "Test" }, serverUrl: "mock", participantToken: "mock",
    }) })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const recovery = () => Array.from(container.querySelectorAll("button"))
    .find(button => button.textContent === "End the previous broadcast");
  try {
    await act(async () => root.render(React.createElement(LiveBroadcast, { host: true })));
    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Test");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Connection failed");
    expect(recovery()).toBeDefined();
    await act(async () => recovery()!.click());
    expect(recovery()).toBeDefined();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Please retry");
    await act(async () => recovery()!.click());
    expect(recovery()).toBeUndefined();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Broadcast ended");
    expect(fetch).toHaveBeenLastCalledWith("/api/v1/professional/live/end", expect.objectContaining({
      method: "POST", body: JSON.stringify({ sessionId: "session" }),
    }));
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

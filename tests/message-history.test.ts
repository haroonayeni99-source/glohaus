// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MessageCentre } from "@/components/message-centre";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
let root: Root;
let container: HTMLDivElement;
const message = (id: string, role: "customer" | "professional") => ({ id, booking_id: null, sender_role: role, body: `${role} message ${id}`, created_at: `2026-10-10T10:00:0${id}Z` });
async function render(role: "customer" | "professional" = "customer", empty = false) {
  await act(async () => root.render(React.createElement(MessageCentre, {
    initialConversations: [], activeConversation: { id: "thread", customer_name: "Alex", professional_name: "Maya", participant_role: role },
    initialMessages: empty ? [] : [message("3", "customer"), message("4", "professional")],
    initialCursor: empty ? null : "latest", initialPrevious: empty ? null : "before3", initialHasMore: !empty,
    bookingId: null, professionalId: null, draftRecipientName: null,
  })));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (work: FrameRequestCallback) => { work(0); return 1; });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ messages: [], next: null }) })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each(["customer", "professional"] as const)("loads both sides of the complete paginated history for a %s", async role => {
  vi.mocked(fetch).mockImplementation(async url => ({ ok: true, json: async () => String(url).includes("before3") ? { messages: [message("2", "professional")], previous: "before2", hasMore: true } : String(url).includes("before2") ? { messages: [message("1", "customer")], previous: null, hasMore: false } : { messages: [], next: null } }) as Response);
  await render(role);
  await act(async () => { [...container.querySelectorAll("button")].find(button => button.textContent === "View full conversation")!.click(); });
  expect([...container.querySelectorAll(".message-bubble p")].map(p => p.textContent)).toEqual(["customer message 1", "professional message 2", "customer message 3", "professional message 4"]);
  expect(container.textContent).toContain("Start of conversation");
  expect(container.textContent).not.toContain("View full conversation");
  expect([...container.querySelectorAll(".message-sender")].map(p => p.textContent)).toEqual(role === "customer" ? ["You", "Maya", "You", "Maya"] : ["Alex", "You", "Alex", "You"]);
});
it("polls an empty conversation without a cursor and displays the other party's reply", async () => {
  vi.useFakeTimers();
  await render("customer", true);
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ messages: [message("1", "professional")], next: "first" }) } as Response);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(fetch).toHaveBeenCalledWith("/api/v1/messages/thread", { cache: "no-store" });
  expect(container.textContent).toContain("professional message 1");
});
it("keeps history retryable when an earlier page fails", async () => {
  await render();
  vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
  await act(async () => { [...container.querySelectorAll("button")].find(button => button.textContent === "View full conversation")!.click(); });
  expect(container.textContent).toContain("Earlier messages could not be loaded.");
  expect(container.querySelectorAll(".message-bubble")).toHaveLength(2);
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "View full conversation")?.disabled).toBe(false);
});
it("does not pull a reader to the bottom when a new reply arrives", async () => {
  vi.useFakeTimers(); await render();
  const thread = container.querySelector(".message-thread-body")! as HTMLDivElement;
  Object.defineProperties(thread, { scrollHeight: { configurable: true, value: 1200 }, clientHeight: { configurable: true, value: 300 } });
  thread.scrollTop = 100;
  await act(async () => thread.dispatchEvent(new Event("scroll", { bubbles: true })));
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ messages: [message("5", "professional")], next: "new" }) } as Response);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(thread.scrollTop).toBe(100);
  expect(container.textContent).toContain("professional message 5");
});

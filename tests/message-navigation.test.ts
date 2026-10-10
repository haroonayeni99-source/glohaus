// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MessagesPage from "@/app/messages/page";

const threads = {
  "11111111-1111-4111-8111-111111111111": "First",
  "22222222-2222-4222-8222-222222222222": "Second",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", props, children),
}));
vi.mock("@/components/public-header", () => ({ PublicHeader: () => null }));
vi.mock("@/components/bottom-navigation", () => ({ BottomNavigation: () => null }));
vi.mock("@/components/professional-navigation", () => ({ ProfessionalNavigation: () => null }));
vi.mock("@/lib/page-access", () => ({
  pageAccount: async () => ({ account: {
    id: "customer", authId: "auth", displayName: "Account",
    roles: ["customer", "professional"], professionalId: "professional",
  } }),
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async (_: string, work: (db: object) => unknown) => work({}),
}));
vi.mock("@/modules/messages/repository", () => ({
  conversationInbox: async () => [],
  conversationDetails: async (_: unknown, id: keyof typeof threads, scope: string) => ({
    id, customer_name: `${threads[id]} customer`, professional_name: `${threads[id]} studio`,
    participant_role: scope === "customer" ? "customer" : "professional",
  }),
  conversationMessagePage: async (_: unknown, id: keyof typeof threads) => ({
    messages: [{ id: `${id}-message`, booking_id: null, sender_role: "customer",
      body: `${threads[id]} thread message`, created_at: "2026-10-10T10:00:00Z" }],
    next: `${id}-cursor`, previous: null, hasMore: false,
  }),
}));
vi.mock("@/modules/bookings/repository", () => ({ bookingById: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
const first = Object.keys(threads)[0];
const second = Object.keys(threads)[1];

async function navigate(thread?: string, view = "customer") {
  const page = await MessagesPage({ searchParams: Promise.resolve({ thread, view }) });
  await act(async () => root.render(page));
}

function composer() {
  return container.querySelector("textarea")!;
}

async function draft(body: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(composer(), body);
    composer().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [], next: null }) }));
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("conversation navigation", () => {
  it.each(["customer", "professional"])("resets messages and draft when a %s switches threads", async (view) => {
    await navigate(first, view);
    await draft("Private first-thread draft");
    expect(composer().value).toBe("Private first-thread draft");
    await navigate(second, view);
    expect(container.textContent).toContain("Second thread message");
    expect(container.textContent).not.toContain("First thread message");
    expect(composer().value).toBe("");

    await draft("Reply to second thread");
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fetch).toHaveBeenCalledWith(`/api/v1/messages/${second}`, expect.objectContaining({
      method: "POST", body: JSON.stringify({ body: "Reply to second thread" }),
    }));
    expect(fetch).toHaveBeenCalledWith(`/api/v1/messages/${second}?after=${second}-cursor`, { cache: "no-store" });
  });

  it("preserves an unsent draft when the same thread refreshes", async () => {
    await navigate(first);
    await draft("Still writing");
    await navigate(first);
    expect(composer().value).toBe("Still writing");
  });

  it("clears previous thread state after returning to the inbox", async () => {
    await navigate(first);
    await draft("Old draft");
    await navigate();
    await navigate(second);
    expect(container.textContent).not.toContain("First thread message");
    expect(composer().value).toBe("");
  });

  it("resets the draft when switching account workspaces", async () => {
    await navigate(first);
    await draft("Customer draft");
    await navigate(first, "professional");
    expect(composer().value).toBe("");
  });
});

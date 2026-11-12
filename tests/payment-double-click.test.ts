// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BookingActions } from "@/components/booking-actions";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: "a" }));

it("sends one payment request for immediate repeat clicks, then permits retry after failure", async () => {
  let finish!: (response: unknown) => void;
  const fetchMock = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(BookingActions, {
      id: "test-booking", status: "payment_pending", professional: false,
      ended: false, cancellable: true,
    })));
    const button = host.querySelector<HTMLButtonElement>('button[aria-busy]')!;
    await act(async () => { button.click(); button.click(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish({ ok: false, status: 503 }));
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => finish({ ok: false, status: 503 }));
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

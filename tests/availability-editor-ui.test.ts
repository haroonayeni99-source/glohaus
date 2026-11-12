// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AvailabilityEditor } from "@/components/availability-editor";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(React.createElement(AvailabilityEditor, {
    initial: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
  })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function submit() {
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
it("keeps the displayed schedule stable until its save completes and ignores repeat submission", async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal("fetch", fetcher);
  await submit();
  expect([...host.querySelectorAll("input")].every(input => input.disabled)).toBe(true);
  expect(host.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
  await submit();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({
    rules: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
  });
  await act(async () => resolve(Response.json({ saved: true })));
  expect(host.textContent).toContain("Your working hours have been saved.");
  expect([...host.querySelectorAll("input")].every(input => !input.disabled)).toBe(true);
  expect(router.refresh).toHaveBeenCalledOnce();
});
it("retains hours and allows a retry after a failed save", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ saved: true }));
  vi.stubGlobal("fetch", fetcher);
  await submit();
  expect(host.textContent).toContain("Could not save your hours. Please try again.");
  expect(host.querySelector<HTMLInputElement>('[aria-label="Monday opening time"]')?.value).toBe("09:00");
  expect(host.querySelector("button")?.disabled).toBe(false);
  expect(router.refresh).not.toHaveBeenCalled();
  await submit();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(router.refresh).toHaveBeenCalledOnce();
});

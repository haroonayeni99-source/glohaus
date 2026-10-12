// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReviewForm } from "@/components/review-form";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
let root: Root;
let container: HTMLDivElement;
async function submit() {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(ReviewForm, {
        bookingId: "11111111-1111-4111-8111-111111111111",
      }),
    ),
  );
  container.querySelector<HTMLInputElement>('[name="publicName"]')!.value =
    "Test customer";
  container.querySelector<HTMLTextAreaElement>('[name="body"]')!.value =
    "A carefully delivered appointment with friendly service.";
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("recognises an already-published review without repeatedly submitting it", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json(
      { error: { code: "REVIEW_ALREADY_EXISTS" } },
      { status: 409 },
    ),
  );
  await submit();
  expect(container.textContent).toContain(
    "You have already reviewed this appointment.",
  );
  expect(container.querySelector("button")!.disabled).toBe(true);
  expect(router.refresh).toHaveBeenCalledOnce();
  await submit();
  expect(fetch).toHaveBeenCalledOnce();
});
it("explains eligibility when the server rejects an unfinished or unrelated booking", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
  );
  await submit();
  expect(container.textContent).toContain(
    "only your own completed appointments",
  );
  expect(container.querySelector("button")!.disabled).toBe(false);
  expect(router.refresh).not.toHaveBeenCalled();
});
it("keeps the customer's text and allows retry after an actual outage", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 }),
  );
  await submit();
  expect(
    container.querySelector<HTMLTextAreaElement>("textarea")!.value,
  ).toContain("carefully delivered");
  expect(container.querySelector("button")!.disabled).toBe(false);
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ saved: true }, { status: 201 }),
  );
  await submit();
  expect(container.textContent).toContain("Your review has been published.");
  expect(container.querySelector("button")!.disabled).toBe(true);
});

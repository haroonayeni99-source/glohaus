// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { AdminSupportInbox } from "@/components/admin-support-inbox";
vi.mock("@/components/support-operations", () => ({
  SupportOperationsPanel: () => null,
}));
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
const tickets = ids.map((id, i) => ({
  id,
  name: `Person ${i}`,
  email: `person${i}@example.test`,
  topic: "Booking",
  reference: "",
  message: "Fictional private support message",
  status: i ? ("resolved" as const) : ("open" as const),
  created_at: "2026-10-25T12:00:00Z",
}));
const detail = (id: string) => ({
  ...tickets.find((t) => t.id === id),
  events: [],
  evidence: [],
});
let root: Root, host: HTMLDivElement;
const fetcher = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fetcher.mockReset();
  fetcher.mockImplementation(async (url: string, init?: RequestInit) =>
    init?.method === "PATCH"
      ? Response.json({ ok: true })
      : Response.json(detail(url.split("/").pop()!)),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(React.createElement(AdminSupportInbox, { initial: tickets })),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function buttons() {
  return Array.from(
    host.querySelectorAll<HTMLButtonElement>(".service-edit-list button"),
  );
}
async function open(i: number) {
  await act(async () => buttons()[i].click());
}
async function draft(text: string) {
  const field = host.querySelector<HTMLTextAreaElement>(
    'textarea[name="note"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
it("does not carry an unsaved reply or previous status to another case", async () => {
  await open(0);
  await draft("Private reply only for person zero");
  await open(1);
  expect(
    host.querySelector<HTMLTextAreaElement>('textarea[name="note"]')!.value,
  ).toBe("");
  expect(
    host.querySelector<HTMLSelectElement>('select[name="status"]')!.value,
  ).toBe("resolved");
  expect(window.confirm).toHaveBeenCalled();
});
it("keeps the draft when staff decline switching cases", async () => {
  await open(0);
  await draft("Keep this reply on this case");
  vi.mocked(window.confirm).mockReturnValue(false);
  await open(1);
  expect(host.querySelector("h3")!.textContent).toContain(ids[0]);
  expect(
    host.querySelector<HTMLTextAreaElement>('textarea[name="note"]')!.value,
  ).toBe("Keep this reply on this case");
});
it("ignores a late response even when the mock transport does not honour abort", async () => {
  let release!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => buttons()[0].click());
  await open(1);
  await act(async () => release(Response.json(detail(ids[0]))));
  expect(host.querySelector("h3")!.textContent).toContain(ids[1]);
});
it("reports saved-but-refresh-failed, clears the sent draft and refreshes without another write", async () => {
  await open(0);
  await draft("A response whose save will succeed");
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === "PATCH"
      ? Response.json({ ok: true })
      : new Response("", { status: 503 }),
  );
  await submit();
  expect(host.textContent).toContain(
    "Response and status saved, but case history could not be refreshed",
  );
  expect(host.textContent).not.toContain("Case history updated");
  expect(
    host.querySelector<HTMLTextAreaElement>('textarea[name="note"]')!.value,
  ).toBe("");
  expect(host.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(
    true,
  );
  fetcher.mockImplementation(async (url: string) =>
    Response.json(detail(url.split("/").pop()!)),
  );
  await act(async () =>
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent === "Refresh case history")!
      .click(),
  );
  expect(host.textContent).toContain("Case history refreshed");
  expect(
    fetcher.mock.calls.filter((c) => c[1]?.method === "PATCH"),
  ).toHaveLength(1);
});
it("blocks case switching while a save is in flight", async () => {
  await open(0);
  await draft("An in flight reply");
  let release!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(buttons().every((b) => b.disabled)).toBe(true);
  await act(async () => release(Response.json({ ok: true })));
  expect(host.querySelector("h3")!.textContent).toContain(ids[0]);
});
it("does not claim a network-interrupted save failed or succeeded and offers a history check", async () => {
  await open(0);
  await draft("A possibly committed response");
  fetcher.mockRejectedValueOnce(new Error("Network interrupted"));
  await submit();
  expect(host.textContent).toContain("Save could not be confirmed");
  expect(
    host.querySelector<HTMLTextAreaElement>('textarea[name="note"]')!.value,
  ).toBe("A possibly committed response");
});

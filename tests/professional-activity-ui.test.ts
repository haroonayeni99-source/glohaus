// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminProfessionalActivity } from "@/components/admin-professional-activity";
import { ProfessionalActivityStatus } from "@/components/professional-activity-status";
import type { ActivityOverview } from "@/modules/professional-activity/domain";
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", props, children),
}));
const initial: ActivityOverview = {
  asOf: "2026-10-14T12:00:00Z",
  page: 0,
  total: 1,
  email: { pending: 0, accepted: 0, cancelled: 0, exhausted: 0 },
  rows: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      business_name: "Maya Studio",
      slug: "maya-studio",
      publication_status: "published",
      last_activity_at: "2026-07-01T10:00:00Z",
      activity_source: "website_visit",
      inactive_days: 67,
      stage: 60,
      warning_at: "2026-10-01T10:00:00Z",
      can_hide: true,
      hidden_at: null,
      can_offer: true,
      offer_until: null,
      boost_until: null,
      upcoming_bookings: 2,
    },
  ],
};
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function button(name: string) {
  const b = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === name,
  );
  if (!b) throw Error("Missing button: " + name);
  return b;
}
async function click(name: string) {
  await act(async () => button(name).click());
}
async function reason() {
  await act(async () => {
    const field = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, "Reviewed the inactivity warning");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("reviews the exact professional and action, with cancel producing no mutation", async () => {
  await act(async () =>
    root.render(
      React.createElement(AdminProfessionalActivity, { initial, owner: true }),
    ),
  );
  await reason();
  await click("Hide from discovery");
  expect(container.querySelector("dialog")?.textContent).toContain(
    "Maya Studio",
  );
  expect(container.querySelector("dialog")?.textContent).toContain(
    "existing bookings and earnings stay available",
  );
  await click("Cancel decision");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("retains the reviewed decision on a server conflict and does not claim it was saved", async () => {
  fetchMock.mockResolvedValue(
    Response.json(
      {
        error: { message: "This professional has returned. Refresh the list." },
      },
      { status: 409 },
    ),
  );
  await act(async () =>
    root.render(
      React.createElement(AdminProfessionalActivity, { initial, owner: true }),
    ),
  );
  await reason();
  await click("Hide from discovery");
  await click("Confirm decision");
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  expect(container.textContent).toContain("This professional has returned");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    professionalId: initial.rows[0].id,
    action: "hide",
    reason: "Reviewed the inactivity warning",
    confirmed: true,
  });
});
it("gives Admin a read-only view and keeps early hiding disabled", async () => {
  await act(async () =>
    root.render(
      React.createElement(AdminProfessionalActivity, { initial, owner: false }),
    ),
  );
  expect(container.textContent).toContain("Read-only view");
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).not.toContain("Hide from discovery");
  await act(async () =>
    root.render(
      React.createElement(AdminProfessionalActivity, {
        key: "owner-view",
        initial: {
          ...initial,
          rows: [{ ...initial.rows[0], can_hide: false }],
        },
        owner: true,
      }),
    ),
  );
  expect(button("Hide from discovery").disabled).toBe(true);
});
it("requires professional acknowledgement before starting the offered boost and displays its real end date", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ saved: true }))
    .mockResolvedValueOnce(
      Response.json({
        hidden: false,
        offerUntil: null,
        boostUntil: "2026-10-21T12:00:00Z",
        eligible: true,
      }),
    );
  await act(async () =>
    root.render(
      React.createElement(ProfessionalActivityStatus, {
        initial: {
          hidden: false,
          offerUntil: "2026-10-28T12:00:00Z",
          boostUntil: null,
          eligible: true,
        },
      }),
    ),
  );
  expect(button("Start my seven-day boost").disabled).toBe(true);
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('input[type="checkbox"]')!
      .click(),
  );
  await click("Start my seven-day boost");
  expect(container.textContent).toContain("21 Oct 2026");
  expect(container.textContent).toContain("boost is active");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    action: "accept_boost",
    confirmed: true,
  });
});

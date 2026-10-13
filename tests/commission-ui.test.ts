// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { CommissionControlCentre } from "@/components/commission-control-centre";
import { AdminWorkspaceView } from "@/components/admin-workspace-view";
import type { CommissionOverview } from "@/modules/commission/domain";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
const data: CommissionOverview = {
  asOf: "2026-10-13T20:00:00Z",
  settings: { enabled: true, new_promotions_enabled: true, version: 1 },
  professionals: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Fictional Studio",
      effective: {
        basisPoints: 800,
        standardBasisPoints: 800,
        ruleId: null,
        ruleReference: "standard:starter",
        pricingVersion: "v2",
        expiresAt: null,
      },
    },
  ],
  rules: [],
  founding: [],
  metrics: {
    commissionEarnedPence: 0,
    waivedPence: 0,
    capturedPence: 0,
    paymentCostsPence: 0,
    costsPending: 0,
    legacyWithoutTerms: 0,
  },
  performance: [],
  audit: [],
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(Response.json({ saved: true }));
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
  location.hash = "professional-commission";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(enabled = true) {
  await act(async () =>
    root.render(
      React.createElement(AdminWorkspaceView, null,
        React.createElement(
          "section",
          {
            id: "professional-commission",
            className: "admin-workspace-section",
          },
          React.createElement(CommissionControlCentre, {
            data: { ...data, settings: { ...data.settings, enabled } },
          }),
        ),
      ),
    ),
  );
}
function form(heading: string) {
  return [...container.querySelectorAll(".commission-box")]
    .find((s) => s.querySelector("h3")?.textContent === heading)!
    .querySelector("form")!;
}
function fill(f: HTMLFormElement, name: string, value: string) {
  const input = f.querySelector(`[name="${name}"]`) as HTMLInputElement;
  input.value = value;
}
async function submit(f: HTMLFormElement) {
  await act(async () => {
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function click(text: string) {
  const b = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  )!;
  await act(async () => b.click());
}
function validRule() {
  const f = form("Schedule a commission rule");
  fill(f, "percentage", "2");
  fill(f, "startsAt", "2026-10-16T10:00");
  fill(f, "endsAt", "2026-11-16T10:00");
  fill(f, "reason", "Owner reviewed offer");
  return f;
}
it("uses one reviewed confirmation and sends nothing on Cancel", async () => {
  const genericConfirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await render();
  await submit(validRule());
  expect(genericConfirm).not.toHaveBeenCalled();
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  await click("Cancel");
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("submits the exact reviewed live rule only after confirmation", async () => {
  await render();
  await submit(validRule());
  await click("Confirm financial change");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/admin/commission");
  expect(JSON.parse(init.body)).toMatchObject({
    action: "create",
    kind: "platform",
    professionalId: null,
    scope: "all",
    basisPoints: 200,
    confirmed: true,
  });
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
});
it("keeps the reviewed draft visible after a failed financial save", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
  );
  await render();
  await submit(validRule());
  await click("Confirm financial change");
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  expect(container.textContent).toContain(
    "Only the verified Owner may change commission.",
  );
});
it("Test Mode bypasses live confirmation and calls only the simulation endpoint", async () => {
  const genericConfirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fetchMock.mockResolvedValue(
    Response.json({
      rule: {
        basisPoints: 0,
        ruleReference: "hypothetical:zero",
        pricingVersion: "simulation-only",
      },
      commissionPence: 0,
      chargePence: 2100,
      professionalPendingPence: 2000,
      providerCostPence: 52,
      platformNetPence: 48,
      waivedPence: 400,
      professionalAfterRefundPence: 2000,
      refundObligationPence: 0,
      totalCommissionPence: 0,
      totalProviderCostPence: 52,
      problems: [],
    }),
  );
  await render(false);
  const f = form("Test Mode — read-only");
  fill(f, "scenario", "zero");
  fill(f, "atTime", "2026-10-16T10:00");
  await submit(f);
  expect(genericConfirm).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/admin/commission/simulate");
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  expect(container.textContent).toContain("Applied rate 0.00%");
});
it("ships disabled with live scheduling unavailable and Test Mode available", async () => {
  await render(false);
  expect(
    form("Schedule a commission rule").querySelector("button")?.disabled,
  ).toBe(true);
  expect(form("Test Mode — read-only").querySelector("button")?.disabled).toBe(
    false,
  );
  expect(container.textContent).toContain(
    "Disabled — awaiting Owner activation",
  );
});

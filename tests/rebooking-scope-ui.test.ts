// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  CustomerRebookingControls,
  ProfessionalRebookingControls,
} from "@/components/rebooking-scope-controls";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const scope = {
  professionalId: "11111111-1111-4111-8111-111111111111",
  businessName: "Studio A",
  channel: "email" as const,
  enabled: false,
};
async function submit(index = 0) {
  await act(async () => {
    container
      .querySelectorAll("form")
      [index].dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
  });
}
it("requires an explicit named-professional checkbox and sends no identity or global opt-in", async () => {
  await act(async () =>
    root.render(
      React.createElement(CustomerRebookingControls, { scopes: [scope] }),
    ),
  );
  const input = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )!;
  expect(input.checked).toBe(false);
  expect(container.textContent).toContain("Studio A");
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => input.click());
  await submit();
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual(
    { professionalId: scope.professionalId, channel: "email", enabled: true },
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("renders no enrolment form for an account without eligible visited professionals", async () => {
  await act(async () =>
    root.render(React.createElement(CustomerRebookingControls, { scopes: [] })),
  );
  expect(container.querySelector("form")).toBeNull();
  expect(container.textContent).toContain("No completed paid visits");
  expect(fetch).not.toHaveBeenCalled();
});
it("saves a professional pause and explicit blank service reset independently", async () => {
  await act(async () =>
    root.render(
      React.createElement(ProfessionalRebookingControls, {
        settings: {
          paused: true,
          delayDays: 28,
          services: [
            {
              serviceId: scope.professionalId,
              name: "Braids",
              delayDays: null,
            },
          ],
        },
      }),
    ),
  );
  expect(
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
      .checked,
  ).toBe(true);
  await submit();
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual(
    { paused: true, delayDays: 28 },
  );
  await submit(1);
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string)).toEqual(
    { serviceId: scope.professionalId, delayDays: null },
  );
});
it("does not claim success or refresh after a rejected save", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 403 }));
  await act(async () =>
    root.render(
      React.createElement(CustomerRebookingControls, { scopes: [scope] }),
    ),
  );
  await submit();
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Save could not be confirmed",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(container.querySelector("button")?.disabled).toBe(false);
});

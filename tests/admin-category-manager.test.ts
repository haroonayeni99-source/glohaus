// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminCategoryManager } from "@/components/admin-category-manager";
import type { AdminCategory } from "@/modules/admin/repository";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const initial: AdminCategory[] = [{ id: "11111111-1111-4111-8111-111111111111", name: "Nails", slug: "nails", active: true, sort_order: 0 }, { id: "22222222-2222-4222-8222-222222222222", name: "Hair", slug: "hair", active: false, sort_order: 20 }];
let container: HTMLDivElement;
let root: Root;
async function render(data = initial) { await act(async () => root.render(React.createElement(AdminCategoryManager, { initial: data }))); }
async function button(name: string) {
  const target = [...container.querySelectorAll("button")].find(button => (button.getAttribute("aria-label") || button.textContent?.trim()) === name)!;
  expect(target).toBeTruthy(); await act(async () => target.click());
}
async function input(name: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
function payload() { return JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string); }
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (work: FrameRequestCallback) => { work(0); return 1; });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "33333333-3333-4333-8333-333333333333", saved: true })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container); await render();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("creates a category using just its name, generates the required fields and shows the saved result", async () => {
  expect(container.querySelector("form")).toBeNull(); await button("Add category");
  expect(document.activeElement).toBe(container.querySelector('[name="name"]'));
  await input("name", "Massage & facials"); await submit();
  expect(payload()).toMatchObject({ id: null, name: "Massage & facials", slug: "massage-and-facials", active: true, sortOrder: 30, reason: "Add category: Massage & facials" });
  expect(container.textContent).toContain("“Massage & facials” added.");
  expect([...container.querySelectorAll(".category-row h3")].map(node => node.textContent)).toEqual(["Nails", "Hair", "Massage & facials"]);
  expect(container.querySelector("form")).toBeNull(); expect(router.refresh).toHaveBeenCalledOnce();
});
it("renames without breaking an existing link and preserves a zero display order", async () => {
  await button("Edit Nails"); await input("name", "Nail art"); await submit();
  expect(payload()).toMatchObject({ id: initial[0].id, name: "Nail art", slug: "nails", sortOrder: 0, reason: "Update category: Nail art" });
  expect(container.textContent).toContain("“Nail art” updated.");
  await render([{ ...initial[0], name: "Server refreshed name" }, initial[1]]);
  expect(container.querySelector(".category-row h3")?.textContent).toBe("Server refreshed name");
});
it("blocks case-insensitive duplicates without losing the draft or attempting a write", async () => {
  await button("Add category"); await input("name", "NAILS"); await submit();
  expect(fetch).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')?.textContent).toContain("already exists");
  expect(container.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("NAILS");
});
it("keeps a failed draft retryable and explains expired MFA", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: { code: "MFA_REQUIRED" } }, { status: 403 }));
  await button("Add category"); await input("name", "Brows"); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Open Security");
  expect(container.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("Brows");
  expect(router.refresh).not.toHaveBeenCalled();
  await submit(); expect(container.textContent).toContain("“Brows” added.");
});
it("shows and hides categories through the existing endpoint without deleting them", async () => {
  await button("Hide Nails"); expect(payload()).toMatchObject({ id: initial[0].id, active: false, slug: "nails", sortOrder: 0 });
  expect(container.querySelectorAll(".category-row")).toHaveLength(2);
  expect(container.textContent).toContain("“Nails” is now hidden.");
  await button("Visible"); expect(container.textContent).toContain("No matching categories");
  await button("Clear filters"); await button("Show Nails");
  expect(container.textContent).toContain("“Nails” is now visible.");
});
it("cancels without writing and starts a clean new form", async () => {
  await button("Edit Hair"); await input("name", "Unsaved name"); await button("Cancel");
  expect(fetch).not.toHaveBeenCalled(); await button("Add category");
  expect(container.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("");
  expect(container.querySelector<HTMLInputElement>('[name="active"]')!.checked).toBe(true);
});

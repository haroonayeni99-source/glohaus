// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { QualityControlWorkspace } from "@/components/quality-control-workspace";
import { qualityDeployment, type QualityDeployment } from "@/lib/quality-control-deployment";
let clean = async () => {};
afterEach(async () => { await clean(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });
async function render(deployment?: QualityDeployment) {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  clean = async () => { await act(async () => root.unmount()); host.remove(); };
  await act(async () => root.render(React.createElement(QualityControlWorkspace, {deployment})));
  await act(async () => { vi.runOnlyPendingTimers(); });
  await act(async () => { vi.runOnlyPendingTimers(); });
  return host;
}
async function tab(host: HTMLElement, name: string) {
  const button = [...host.querySelectorAll("button")].find(button => button.textContent === name)!;
  expect(button).toBeTruthy(); await act(async () => button.click());
}
it.each(["production", "preview", "development"])("shows this %s build instead of an obsolete production snapshot", async environment => {
  const commit = "a".repeat(40);
  const host = await render(qualityDeployment({VERCEL_ENV:environment,VERCEL_GIT_COMMIT_SHA:commit,VERCEL_GIT_COMMIT_REF:"feature/current"}));
  await tab(host,"Live vs pending");
  expect(host.textContent).toContain(`${environment} · feature/current · ${commit}`);
  expect(host.textContent).not.toContain("569742675");
  expect(host.textContent).not.toContain("8 Nov 2026");
  expect(host.textContent).toContain("does not certify production promotion");
  const links = [...host.querySelectorAll("a")].map(a=>a.href);
  expect(links).toContain("https://github.com/haroonayeni99-source/glohaus/blob/main/docs/task-registers/INDEPENDENT-WORK.md");
  expect(links).toContain("https://github.com/haroonayeni99-source/glohaus/blob/main/docs/task-registers/OWNER-ACTION-REQUIRED.md");
});
it("shows unknown metadata without inventing a ready production deployment", async () => {
  const host=await render(qualityDeployment({VERCEL_ENV:"other",VERCEL_GIT_COMMIT_SHA:"invalid",VERCEL_GIT_COMMIT_REF:""}));
  await tab(host,"Live vs pending");
  expect(host.textContent).toContain("unknown · Branch not supplied · Commit not supplied");
});
it("retains a saved audit rather than overwriting unreadable browser data", async () => {
  const existing="{unreadable audit"; localStorage.setItem("glohaus-owner-quality-control-v1",existing);
  const write=vi.spyOn(Storage.prototype,"setItem");
  const host=await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("has not been overwritten");
  expect(write).not.toHaveBeenCalled();
  expect(localStorage.getItem("glohaus-owner-quality-control-v1")).toBe(existing);
  await tab(host,"Bugs"); expect(host.textContent).toContain("Bug register");
});
it("keeps the workspace usable and offers export if writes exceed storage quota", async () => {
  vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new DOMException("Quota exceeded","QuotaExceededError");});
  const host=await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("export an audit backup");
  await tab(host,"Report a bug");
  expect(host.querySelector("form")).toBeTruthy();
  expect([...host.querySelectorAll("button")].some(button=>button.textContent==="Export audit backup (JSON)")).toBe(true);
});
it("retains the manual checklist and stored notes in normal browser storage", async () => {
  const host=await render(); await tab(host,"Regression");
  const checkbox=host.querySelector('input[type="checkbox"]') as HTMLInputElement;
  await act(async()=>checkbox.click());
  const stored=JSON.parse(localStorage.getItem("glohaus-owner-quality-control-v1")!);
  expect(stored.regression["Customer can register and sign in"]).toBe(true);
});

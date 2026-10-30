import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import Page, { generateMetadata } from "@/app/sign-in/[[...sign-in]]/page";

const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(url); }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/preview-auth", () => ({ productionAuthUrl: () => null }));
vi.mock("@/lib/config", () => ({ authConfigured: () => true }));
vi.mock("@/components/auth-frame", () => ({ AuthFrame: "div" }));
vi.mock("@/components/email-auth-form", () => ({ EmailAuthForm: "form" }));
vi.mock("@/components/access-message", () => ({ AccessMessage: "div" }));
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("React", React); });
it("preserves an explicit Owner destination despite a stale professional intent", async () => {
  const result = await Page({ searchParams: Promise.resolve({ returnTo: "/admin", intent: "professional" }) });
  expect(redirect).not.toHaveBeenCalled();
  const children = result.props.children.props.children;
  expect(children[0].props.children[0].props.children).toBe("Owner / Admin sign in");
  expect(children[0].props["aria-label"]).toBe("Owner / Admin sign in");
  expect(children[1].props.redirectTo).toBe("/admin");
  expect(children[1].props.ownerEntry).toBe(true);
});
it("keeps ordinary professional sign-in intent working", async () => {
  await expect(Page({ searchParams: Promise.resolve({ intent: "professional" }) })).rejects.toThrow("/professional/sign-in");
});
it("does not treat an external return target as Owner intent", async () => {
  await expect(Page({ searchParams: Promise.resolve({ returnTo: "https://evil.example/admin", intent: "professional" }) })).rejects.toThrow("/professional/sign-in");
});

it.each([
  ["/admin", "Owner / Admin sign in"],
  ["/admin/settings", "Owner / Admin sign in"],
  ["/administrator", "Customer sign in"],
  ["https://evil.example/admin", "Customer sign in"],
  [undefined, "Customer sign in"],
])("labels the safe sign-in destination %s consistently", async (returnTo, title) => {
  expect(await generateMetadata({ searchParams: Promise.resolve({ returnTo }) })).toEqual({ title });
});

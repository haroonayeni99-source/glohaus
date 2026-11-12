import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), account: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
}));
vi.mock("@/lib/identity", () => ({ getIdentity: mocks.identity }));
vi.mock("@/lib/db", () => ({ withIdentity: (_: unknown, work: (db: object) => unknown) => work({}) }));
vi.mock("@/modules/accounts/repository", () => ({ findAccount: mocks.account }));
import Page from "@/app/onboarding/page";
import { AccessError } from "@/modules/accounts/domain";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  mocks.identity.mockResolvedValue({ authId: "fixture" });
});
afterEach(() => vi.unstubAllGlobals());

it("retains professional enrolment for a customer requesting that workspace", async () => {
  mocks.account.mockResolvedValue({ status: "active", roles: ["customer"] });
  const tree = await Page({ searchParams: Promise.resolve({ intent: "professional" }) });
  expect(tree.props.children.props.initialRole).toBe("professional");
});

it("does not route a suspended account into a workspace", async () => {
  mocks.account.mockResolvedValue({ status: "suspended", roles: ["customer"] });
  const tree = await Page({ searchParams: Promise.resolve({}) });
  expect(tree.props.children.props.code).toBe("ACCOUNT_INACTIVE");
});

it.each([
  [["customer"], "/account"],
  [["professional"], "/professional"],
  [["owner", "professional"], "/admin"],
])("routes an existing %j account instead of swallowing the framework redirect", async (roles, path) => {
  mocks.account.mockResolvedValue({ status: "active", roles });
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(`NEXT_REDIRECT:${path}`);
});

it("still sends unauthenticated visitors to sign-in", async () => {
  mocks.identity.mockRejectedValue(new AccessError("UNAUTHENTICATED", 401));
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/sign-in");
});

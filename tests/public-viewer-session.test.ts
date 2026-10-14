import { beforeEach, expect, it, vi } from "vitest";
import { publicViewerSignedIn } from "@/lib/public-viewer";
const mocks = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock("@/lib/identity", () => ({ getIdentity: mocks.identity }));
beforeEach(() => vi.clearAllMocks());
it("keeps verified sign-in state independent of application database availability", async () => {
  vi.stubEnv("DATABASE_URL", "");
  mocks.identity.mockResolvedValue({ authId: "verified-user" });
  expect(await publicViewerSignedIn()).toBe(true);
  vi.unstubAllEnvs();
});
it("does not invent a session when identity verification fails", async () => {
  mocks.identity.mockRejectedValue(new Error("No verified session"));
  expect(await publicViewerSignedIn()).toBe(false);
});

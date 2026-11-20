import { expect, it } from "vitest";
import { portfolioWorkspaceEnabled } from "@/lib/portfolio-workspace";
it("does not activate an unverified workspace in production or development", () => {
  expect(portfolioWorkspaceEnabled({ VERCEL_ENV: "production", PORTFOLIO_WORKSPACE_ENABLED: "true" })).toBe(false);
  expect(portfolioWorkspaceEnabled({ VERCEL_ENV: "development" })).toBe(false);
});
it("allows the Preview acceptance candidate with an explicit off switch", () => {
  expect(portfolioWorkspaceEnabled({ VERCEL_ENV: "preview" })).toBe(true);
  expect(portfolioWorkspaceEnabled({ VERCEL_ENV: "preview", PORTFOLIO_WORKSPACE_ENABLED: "false" })).toBe(false);
});

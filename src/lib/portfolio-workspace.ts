import "server-only";

type PortfolioEnvironment = {
  VERCEL_ENV?: string;
  PORTFOLIO_WORKSPACE_ENABLED?: string;
};

/** Keep the unverified combined workspace in Preview until hosted acceptance. */
export function portfolioWorkspaceEnabled(env: PortfolioEnvironment = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  PORTFOLIO_WORKSPACE_ENABLED: process.env.PORTFOLIO_WORKSPACE_ENABLED,
}) {
  return env.VERCEL_ENV === "preview" && env.PORTFOLIO_WORKSPACE_ENABLED !== "false";
}

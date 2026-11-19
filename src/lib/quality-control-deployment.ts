import "server-only";

export type QualityDeployment = { environment: string; commit: string | null; branch: string | null };
type DeploymentEnvironment = { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_SHA?: string; VERCEL_GIT_COMMIT_REF?: string };
/** Only non-secret build metadata is passed to the existing Owner-only page. */
export function qualityDeployment(env: DeploymentEnvironment = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
}): QualityDeployment {
  return {
    environment: ["production", "preview", "development"].includes(env.VERCEL_ENV ?? "") ? env.VERCEL_ENV! : "unknown",
    commit: /^[a-f0-9]{40}$/i.test(env.VERCEL_GIT_COMMIT_SHA ?? "") ? env.VERCEL_GIT_COMMIT_SHA! : null,
    branch: env.VERCEL_GIT_COMMIT_REF?.trim().slice(0, 200) || null,
  };
}

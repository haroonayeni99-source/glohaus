import "server-only";
type RolloutEnvironment = { VERCEL_ENV?: string; OUR_WORK_VIEWER_ENABLED?: string; OUR_WORK_VIEWER_TEST_SLUGS?: string };
/** Public display only; never enables provider OAuth, imports, publication or account-management gates. */
export function ourWorkViewerEnabled(slug: string, env: RolloutEnvironment = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  OUR_WORK_VIEWER_ENABLED: process.env.OUR_WORK_VIEWER_ENABLED,
  OUR_WORK_VIEWER_TEST_SLUGS: process.env.OUR_WORK_VIEWER_TEST_SLUGS,
}) {
  if (env.OUR_WORK_VIEWER_ENABLED === "false") return false;
  if (env.VERCEL_ENV === "preview") return true;
  if (env.VERCEL_ENV !== "production") return false;
  return env.OUR_WORK_VIEWER_ENABLED === "true" || Boolean(env.OUR_WORK_VIEWER_TEST_SLUGS?.split(",").map(value => value.trim()).filter(Boolean).includes(slug));
}

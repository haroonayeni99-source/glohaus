import "server-only";

const DEFAULT_PRODUCTION_HOST = "glohaus-app.vercel.app";

export function productionAuthUrl(path: string, params?: URLSearchParams) {
  if (process.env.VERCEL_ENV !== "preview") return null;

  const host =
    process.env.GLOHAUS_PRODUCTION_HOST?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    DEFAULT_PRODUCTION_HOST;

  const url = new URL(path, `https://${host}`);
  if (params) url.search = params.toString();
  return url.toString();
}

import "server-only";

export function productionAuthUrl(path: string, params?: URLSearchParams) {
  if (process.env.VERCEL_ENV !== "preview") return null;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!host) return null;
  const url = new URL(path, `https://${host}`);
  if (params) url.search = params.toString();
  return url.toString();
}

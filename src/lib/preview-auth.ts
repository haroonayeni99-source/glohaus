import "server-only";

const DEFAULT_PRODUCTION_HOST = "glohaus1.vercel.app";

export function productionAuthUrl(path: string, params?: URLSearchParams) {
  if (process.env.VERCEL_ENV !== "preview") return null;

  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const host =
    process.env.GLOHAUS_PRODUCTION_HOST?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    DEFAULT_PRODUCTION_HOST;

  const base = (() => {
    if (configuredOrigin) {
      try {
        const parsed = new URL(configuredOrigin);
        if (parsed.protocol === "https:" || parsed.protocol === "http:")
          return parsed.origin;
      } catch {}
    }
    return `https://${host}`;
  })();

  const url = new URL(path, base);
  if (params) url.search = params.toString();
  return url.toString();
}

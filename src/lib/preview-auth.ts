import "server-only";

const DEFAULT_PRODUCTION_ORIGIN = "https://glohaus.shop";

export function productionAuthUrl(path: string, params?: URLSearchParams) {
  if (process.env.VERCEL_ENV !== "preview") return null;

  const configuredOrigin =
    process.env.GLOHAUS_PRODUCTION_ORIGIN?.trim() ||
    DEFAULT_PRODUCTION_ORIGIN;

  const base = (() => {
    try {
      const parsed = new URL(configuredOrigin);
      if (parsed.protocol === "https:" || parsed.protocol === "http:")
        return parsed.origin;
    } catch {}

    return DEFAULT_PRODUCTION_ORIGIN;
  })();

  const url = new URL(path, base);
  if (params) url.search = params.toString();
  return url.toString();
}

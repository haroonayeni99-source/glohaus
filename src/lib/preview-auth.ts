import "server-only";

const DEFAULT_PRODUCTION_ORIGIN = "https://glohaus.shop";
// The existing disposable validation project, never the production database.
const VALIDATION_PROJECT = "rqsyakggwmpkqzzogvll";

function isolatedValidationPreview() {
  if (process.env.GLOHAUS_ISOLATED_PREVIEW_AUTH !== "true") return false;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== `https://${VALIDATION_PROJECT}.supabase.co`)
    return false;
  try {
    const database = new URL(process.env.DATABASE_URL || "");
    return ["postgres:", "postgresql:"].includes(database.protocol) &&
      ((database.hostname === `db.${VALIDATION_PROJECT}.supabase.co`) ||
        (database.hostname.endsWith(".pooler.supabase.com") &&
          decodeURIComponent(database.username).endsWith(`.${VALIDATION_PROJECT}`)));
  } catch { return false; }
}

export function productionAuthUrl(path: string, params?: URLSearchParams) {
  if (process.env.VERCEL_ENV !== "preview") return null;
  if (isolatedValidationPreview()) return null;

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

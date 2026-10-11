import type { MetadataRoute } from "next";
import { publicOrigin, publicPages } from "@/lib/public-seo";
import { withIdentity } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = Object.keys(publicPages).map((path) => ({
    url: `${publicOrigin}${path}`,
    changeFrequency:
      path === "/explore" || path === "/discover" ? "daily" : "weekly",
  }));
  if (process.env.DATABASE_URL) {
    try {
      const profiles = await withIdentity(
        "",
        async (db) =>
          (
            await db.query<{ slug: string }>(
              "SELECT slug FROM beauty.public_professionals WHERE slug IS NOT NULL ORDER BY slug LIMIT 49000",
            )
          ).rows,
      );
      pages.push(
        ...profiles
          .filter((p) => /^[a-z0-9][a-z0-9-]{2,59}$/.test(p.slug))
          .map((p) => ({
            url: `${publicOrigin}/p/${p.slug}`,
            changeFrequency: "weekly" as const,
          })),
      );
    } catch {
      console.error("Public profile sitemap unavailable");
      throw new Error("Sitemap directory temporarily unavailable");
    }
  }
  return pages;
}

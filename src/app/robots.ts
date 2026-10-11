import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/public-seo";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/admin",
        "/account",
        "/professional/",
        "/messages",
        "/wallet",
        "/notifications",
        "/security",
        "/preferences",
        "/onboarding",
        "/workspace",
        "/cart",
      ],
    },
    sitemap: `${publicOrigin}/sitemap.xml`,
    host: publicOrigin,
  };
}

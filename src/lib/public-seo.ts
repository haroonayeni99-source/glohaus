import type { Metadata } from "next";

export const publicOrigin = "https://www.glohaus.shop";
// This existing published listing explicitly identifies itself as a live QA fixture.
// Keep it reachable for QA without advertising it in Google.
export function isIndexablePublicProfile(slug: string) {
  return slug !== "glohaus-test-studio";
}
export const publicPages = {
  "/": [
    "Discover & Book Beauty Professionals",
    "Find hairstylists, nail technicians, barbers, makeup artists and more on GLOHAUS. Explore services, compare professionals and book with confidence.",
  ],
  "/explore": [
    "Find a beauty professional",
    "Search beauty services near you. Filter by area, price, verified professionals, ratings and availability.",
  ],
  "/discover": [
    "Beauty inspiration",
    "Discover the latest work, portfolios and beauty inspiration from GLOHAUS professionals.",
  ],
  "/shop": [
    "Beauty marketplace",
    "Explore products from independent GLOHAUS beauty professionals.",
  ],
  "/about": [
    "About GLOHAUS",
    "Meet GLOHAUS: a marketplace connecting customers with independent beauty professionals and their work.",
  ],
  "/contact": ["Contact GLOHAUS support", "Get help with your GLOHAUS account, bookings and Shop orders."],
  "/faq": [
    "Frequently asked questions",
    "Find answers about GLOHAUS accounts, professional pages, bookings, payments and support.",
  ],
  "/how-it-works": [
    "How GLOHAUS works",
    "Learn how to find a professional, compare services, book and manage your beauty appointments.",
  ],
} as const;

export function publicMetadata(
  path: string,
  title: string,
  description: string,
): Metadata {
  const index =
    process.env.VERCEL_ENV !== "preview" &&
    process.env.VERCEL_ENV !== "development" &&
    (!path.startsWith("/p/") || isIndexablePublicProfile(path.slice(3)));
  return {
    title,
    description,
    alternates: { canonical: `${publicOrigin}${path}` },
    robots: { index, follow: true },
    openGraph: {
      title,
      description,
      url: `${publicOrigin}${path}`,
      siteName: "GLOHAUS",
      type: "website",
      locale: "en_GB",
    },
    twitter: { card: "summary", title, description },
  };
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

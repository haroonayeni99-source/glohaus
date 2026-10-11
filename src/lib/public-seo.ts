import type { Metadata } from "next";

export const publicOrigin = "https://www.glohaus.shop";
export const publicPages = {
  "/": [
    "Find beauty professionals near you",
    "Find independent beauty professionals, compare services and prices, and book your next appointment with GLOHAUS.",
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
    process.env.VERCEL_ENV !== "development";
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

import { z } from "zod";
export const providerSchema = z.enum([
  "google",
  "outlook",
  "ics",
  "instagram",
  "tiktok",
]);
export type Provider = z.infer<typeof providerSchema>;
export const calendarProviders: Provider[] = ["google", "outlook", "ics"];
export const preferencesSchema = z
  .object({
    bufferMinutes: z.union([z.literal(0), z.literal(15), z.literal(30)]),
    travelBufferMinutes: z.union([z.literal(0), z.literal(15), z.literal(30)]),
  })
  .strict();
export function socialPostLink(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw Error("INVALID_SOCIAL_URL");
  const host = url.hostname.replace(/^www\./, "");
  const instagram = /^\/(p|reel)\/([A-Za-z0-9_-]{3,100})\/?$/.exec(
    url.pathname,
  );
  const tiktok = /^\/@[A-Za-z0-9_.]{1,64}\/video\/(\d{5,30})\/?$/.exec(
    url.pathname,
  );
  if (host === "instagram.com" && instagram)
    return {
      platform: "instagram" as const,
      externalId: instagram[2],
      url: `https://www.instagram.com/${instagram[1]}/${instagram[2]}/`,
    };
  if (host === "tiktok.com" && tiktok)
    return {
      platform: "tiktok" as const,
      externalId: tiktok[1],
      url: `https://www.tiktok.com${url.pathname.replace(/\/$/, "")}`,
    };
  throw Error("INVALID_SOCIAL_URL");
}
export const socialInputSchema = z
  .object({
    url: z
      .string()
      .max(500)
      .refine((value) => {
        try {
          socialPostLink(value);
          return true;
        } catch {
          return false;
        }
      }),
    caption: z.string().trim().max(1800),
    serviceId: z.uuid().nullable(),
    consent: z.literal(true),
  })
  .strict();
export const socialUpdateSchema = z
  .object({
    id: z.uuid(),
    publicationStatus: z.enum(["draft", "published", "hidden"]),
    serviceId: z.uuid().nullable(),
    sortOrder: z.number().int().min(0).max(10000),
    featured: z.boolean().default(false),
  })
  .strict();
export type ConnectionStatus = {
  id: string;
  provider: Provider;
  label: string;
  status: string;
  auto_publish: boolean;
  export_bookings: boolean;
  last_success_at: string | null;
  last_error: string | null;
  social_mode?: "automatic" | "approval" | "manual";
  sync_enabled?: boolean;
};
export type SocialPost = {
  id: string;
  platform: "instagram" | "tiktok";
  original_url: string;
  caption: string;
  source_created_at: string | null;
  service_id: string | null;
  publication_status: string;
  sort_order: number;
  featured?: boolean;
  source_available?: boolean;
  media_type?: "link" | "image" | "carousel" | "video";
  has_thumbnail?: boolean;
};
export function socialProfileLink(
  value: string,
  platform: "instagram" | "tiktok",
) {
  if (!value.trim()) return "";
  const url = new URL(value.trim());
  const host = url.hostname.replace(/^www\./, "");
  const match =
    platform === "instagram"
      ? /^\/([A-Za-z0-9_.]{1,30})\/?$/.exec(url.pathname)
      : /^\/@([A-Za-z0-9_.]{1,64})\/?$/.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !match ||
    host !== `${platform}.com` ||
    (platform === "instagram" &&
      ["p", "reel", "reels", "explore", "accounts", "direct"].includes(
        match[1].toLowerCase(),
      ))
  )
    throw Error("INVALID_SOCIAL_PROFILE");
  return platform === "instagram"
    ? `https://www.instagram.com/${match[1]}/`
    : `https://www.tiktok.com/@${match[1]}`;
}
export const portfolioPreferencesSchema = z
  .object({
    action: z.literal("portfolioPreferences"),
    maxVisiblePosts: z.number().int().min(1).max(40),
    instagramUrl: z.string().max(500),
    tiktokUrl: z.string().max(500),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [key, platform] of [
      ["instagramUrl", "instagram"],
      ["tiktokUrl", "tiktok"],
    ] as const) {
      try {
        socialProfileLink(value[key], platform);
      } catch {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Use a valid HTTPS profile link.",
        });
      }
    }
  });
export function socialThumbnailUrl(
  value: unknown,
  platform: "instagram" | "tiktok",
) {
  if (typeof value !== "string" || value.length > 4000) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const domains =
      platform === "instagram"
        ? ["cdninstagram.com", "fbcdn.net"]
        : [
            "tiktokcdn.com",
            "tiktokcdn-us.com",
            "tiktokcdn-eu.com",
            "byteoversea.com",
          ];
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !domains.some((d) => host === d || host.endsWith(`.${d}`)) ||
      [...url.searchParams.keys()].some((k) =>
        /^(access_token|client_secret|refresh_token|authorization)$/i.test(k),
      )
    )
      return "";
    return url.toString();
  } catch {
    return "";
  }
}
export type OwnerSocialOverview = {
  enabled: boolean;
  accounts: {
    provider: string;
    connected: number;
    successes: number;
    failures: number;
    reconnect: number;
    last_success: string | null;
  }[];
  professionals: {
    id: string;
    business_name: string;
    paused: boolean;
    connected: number;
    reconnect: number;
    last_success: string | null;
    reports: number;
  }[];
};
export type PublicSocialPost = SocialPost & {
  professional_id: string;
  slug: string;
  business_name: string;
  service_name: string | null;
  price_pence: number | null;
};

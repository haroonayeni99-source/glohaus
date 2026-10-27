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
};
export type PublicSocialPost = SocialPost & {
  professional_id: string;
  slug: string;
  business_name: string;
  service_name: string | null;
  price_pence: number | null;
};

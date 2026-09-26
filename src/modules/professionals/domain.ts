import { z } from "zod";
import {
  depositLimitMessage,
  isRequiredDepositWithinLimit,
} from "@/modules/bookings/deposit-policy";
export const categories = [
  "Hair",
  "Nails",
  "Makeup",
  "Lashes & brows",
  "Skin",
] as const;
function socialUrl(hosts?: string[]) {
  return z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            !url.port &&
            (!hosts || hosts.includes(url.hostname))
          );
        } catch {
          return false;
        }
      },
      {
        message: hosts
          ? "Enter the full HTTPS link to this social profile."
          : "Enter a valid HTTPS website URL without embedded credentials.",
      },
    );
}
export const profileSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{2,59}$/),
    businessName: z.string().trim().min(2).max(100),
    bio: z.string().trim().min(20).max(600),
    city: z.string().trim().min(2).max(80),
    category: z.enum(categories),
    publicationStatus: z.enum(["draft", "published", "hidden"]),
    businessDescription: z.string().trim().max(3000).optional(),
    locationDetails: z.string().trim().max(180).optional(),
    contactPreference: z
      .enum(["booking", "email", "phone", "instagram"])
      .optional(),
    contactEmail: z
      .string()
      .trim()
      .pipe(z.union([z.email().max(254), z.literal("")]))
      .optional(),
    contactPhone: z
      .string()
      .trim()
      .regex(/^$|^[+()0-9 .-]{7,25}$/, "Enter a valid phone number.")
      .refine((value) => !value || value.replace(/\D/g, "").length >= 7, {
        message: "Enter at least seven digits for a phone number.",
      })
      .optional(),
    instagramUrl: socialUrl(["instagram.com", "www.instagram.com"]).optional(),
    tiktokUrl: socialUrl(["tiktok.com", "www.tiktok.com"]).optional(),
    websiteUrl: socialUrl().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const required =
      value.contactPreference === "email"
        ? "contactEmail"
        : value.contactPreference === "phone"
          ? "contactPhone"
          : value.contactPreference === "instagram"
            ? "instagramUrl"
            : null;
    if (required && !value[required])
      ctx.addIssue({
        code: "custom",
        path: [required],
        message: "Add the contact details for your preferred contact method.",
      });
  });
export const serviceSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500),
    durationMinutes: z.number().int().min(15).max(480).multipleOf(5),
    pricePence: z.number().int().min(100).max(1000000),
    depositPence: z
      .number()
      .int()
      .min(0)
      .refine((amount) => amount === 0 || amount >= 30, {
        message: "Deposits must be zero or at least £0.30",
      }),
    active: z.boolean(),
    assetId: z.uuid().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!isRequiredDepositWithinLimit(value.pricePence, value.depositPence))
      context.addIssue({
        code: "custom",
        path: ["depositPence"],
        message: depositLimitMessage(value.pricePence),
      });
  });
export const professionalPresentationSchema = z
  .object({
    profileStyle: z.enum(["signature", "minimal", "editorial"]),
    portfolioLayout: z.enum(["grid", "feature"]),
    serviceStyle: z.enum(["cards", "clean"]),
  })
  .strict();
export type ProfessionalPresentationInput = z.infer<
  typeof professionalPresentationSchema
>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type PublicProfessional = {
  photo_id?: string | null;
  photo_alt?: string | null;
  rating?: number | null;
  review_count?: number;
  from_price_pence?: number | null;
  id: string;
  slug: string;
  business_name: string;
  bio: string;
  city: string;
  category: (typeof categories)[number];
};
export type Service = {
  asset_id?: string | null;
  image_alt?: string | null;
  id: string;
  professional_id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_pence: number;
  deposit_pence: number;
  active?: boolean;
};
export const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );

export type ProfileDetails = {
  id: string;
  business_description: string;
  location_details: string;
  contact_preference: "booking" | "email" | "phone" | "instagram";
  contact_email: string;
  contact_phone: string;
  instagram_url: string;
  tiktok_url: string;
  website_url: string;
  photo_id: string | null;
  photo_alt: string | null;
};

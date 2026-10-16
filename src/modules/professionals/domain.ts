import { z } from "zod";
import { serviceOptionSchema, type ServiceOption } from "@/modules/taxonomy/domain";
import {
  depositLimitMessage,
  isDepositWithinMaximum,
} from "@/modules/bookings/deposit-policy";
export const fallbackCategories = [
  "Hair",
  "Nails",
  "Makeup",
  "Lashes & brows",
  "Skin",
] as const;
export const categories = fallbackCategories;
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
    category: z.string().trim().min(2).max(60),
    publicationStatus: z.enum(["draft", "published", "hidden"]),
    businessDescription: z.string().trim().max(3000).optional(),
    locationDetails: z.string().trim().max(180).optional(),
    travelsToYou: z.preprocess((value) => value === true || value === "true", z.boolean()).optional(),
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
    category: z.string().trim().min(2).max(60).optional(),
    categoryId:z.uuid().nullable().optional(),specialityId:z.uuid().nullable().optional(),templateId:z.uuid().nullable().optional(),
    publicationStatus:z.enum(["draft","published","inactive"]).optional(),
    variations:z.array(serviceOptionSchema.refine(v=>v.pricePence>=100&&v.durationMinutes>=15,"Variations need a price of at least £1 and a duration of at least 15 minutes.")).max(20).optional(),
    extras:z.array(serviceOptionSchema).max(10).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!isDepositWithinMaximum(value.pricePence, value.depositPence))
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
  identity_verified?: boolean;
  business_verified?: boolean;
  professional_verified?: boolean;
  public_latitude?: number | null;
  public_longitude?: number | null;
  public_location_confirmed_at?: string | null;
  distance_miles?: number | null;
  photo_id?: string | null;
  portfolio_photo_id?: string | null;
  photo_alt?: string | null;
  rating?: number | null;
  review_count?: number;
  // Discovery confidence score; never displayed as the professional's star rating.
  ranking_score?: number;
  boosted?: boolean;
  from_price_pence?: number | null;
  travels_to_you?: boolean;
  available_today?: boolean;
  next_available_at?: string | Date | null;
  popular_services?: string[];
  matching_services?:{id:string;name:string;speciality_id:string|null;speciality_name:string|null;price_pence:number;duration_minutes:number}[];
  id: string;
  slug: string;
  business_name: string;
  bio: string;
  city: string;
  category: string;
  verification_status?: "unverified" | "pending" | "verified" | "restricted";
};
export type Service = {
  category_id?:string|null;speciality_id?:string|null;template_id?:string|null;
  speciality_name?:string|null;category_name?:string|null;publication_status?:"published"|"draft"|"inactive";
  categorisation_status?:"approved"|"needs_review"|"blocked";categorisation_reason?:string;
  options?:ServiceOption[];asset_media_type?:"image"|"video"|null;
  from_price_pence?:number;has_variations?:boolean;
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
  category?: string;
};
export const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );

export type ProfileDetails = {
  id: string;
  business_description: string;
  location_details: string;
  travels_to_you?: boolean;
  contact_preference: "booking" | "email" | "phone" | "instagram";
  contact_email: string;
  contact_phone: string;
  instagram_url: string;
  tiktok_url: string;
  website_url: string;
  photo_id: string | null;
  photo_alt: string | null;
};

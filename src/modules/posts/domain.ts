import { z } from "zod";
export const postSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().min(20).max(1800),
    kind: z.enum(["design", "tutorial"]),
    publicationStatus: z.enum(["draft", "published", "hidden"]),
    serviceId: z.uuid().nullable(),
    assetId: z.uuid().nullable().optional(),
  })
  .strict();
export type PostInput = z.infer<typeof postSchema>;
export type PublicPost = {
  asset_id?: string | null;
  id: string;
  title: string;
  body: string;
  kind: "design" | "tutorial";
  slug: string;
  business_name: string;
  category: string;
  city: string;
  service_id: string | null;
  service_name: string | null;
  price_pence: number | null;
  professional_id: string;
};
export type OwnPost = {
  asset_id?: string | null;
  id: string;
  title: string;
  body: string;
  kind: "design" | "tutorial";
  publication_status: "draft" | "published" | "hidden";
  service_id: string | null;
};

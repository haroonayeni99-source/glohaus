import { z } from "zod";

export const storyInputSchema = z.object({
  assetId: z.uuid(),
  serviceId: z.uuid().nullable(),
  caption: z.string().trim().max(240),
}).strict();

export type StoryInput = z.infer<typeof storyInputSchema>;

export type PublicStory = {
  id: string;
  professional_id: string;
  asset_id: string;
  service_id: string | null;
  caption: string;
  created_at: string;
  expires_at: string;
  slug: string;
  business_name: string;
  city: string;
  category: string;
  media_type: "image" | "video";
  mime_type: string;
  service_name: string | null;
  price_pence: number | null;
};

import { z } from "zod";

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1200),
    sku: z.string().trim().min(1).max(80).nullable(),
    pricePence: z.number().int().min(50).max(100_000_000),
    stockQuantity: z.number().int().min(0).max(1_000_000),
    imageAssetId: z.uuid().nullable(),
    publicationStatus: z.enum(["draft", "published", "archived"]),
  })
  .strict();

export type ProductInput = z.infer<typeof productInputSchema>;

export type ProfessionalProduct = {
  id: string;
  professional_id: string;
  image_asset_id: string | null;
  name: string;
  description: string;
  sku: string | null;
  price_pence: number;
  stock_quantity: number;
  publication_status: "draft" | "published" | "archived";
  created_at: Date;
  updated_at: Date;
};

export type PublicProduct = {
  id: string;
  professional_id: string;
  image_asset_id: string | null;
  name: string;
  description: string;
  price_pence: number;
  in_stock: boolean;
  professional_slug: string;
  professional_name: string;
  updated_at: Date;
};

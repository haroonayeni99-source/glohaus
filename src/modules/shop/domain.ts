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


export const cartItemInputSchema = z
  .object({
    productId: z.uuid(),
    quantity: z.number().int().min(0).max(20),
  })
  .strict();

export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export type CartItem = {
  productId: string;
  professionalId: string;
  professionalName: string;
  professionalSlug: string;
  imageAssetId: string | null;
  name: string;
  pricePence: number;
  quantity: number;
  available: boolean;
  inStockForQuantity: boolean;
};

export type CartOverview = {
  items: CartItem[];
  totalPence: number;
  itemCount: number;
};


export type ProductOrderItem = {
  id: string;
  productId: string;
  productName: string;
  imageAssetId: string | null;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
};

export type ProductOrder = {
  id: string;
  professionalId: string;
  professionalName: string;
  status:
    | "paid"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "refund_pending"
    | "refunded";
  subtotalPence: number;
  deliveryPence: number;
  totalPence: number;
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  countryCode: string;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  shippedAt: Date | string | null;
  deliveredAt: Date | string | null;
  createdAt: Date | string;
  items: ProductOrderItem[];
};

export const fulfilmentUpdateSchema = z
  .object({
    status: z.enum(["processing", "shipped"]),
    carrier: z.string().trim().min(2).max(80).nullable().optional(),
    trackingNumber: z.string().trim().min(3).max(120).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === "shipped" &&
      (!value.carrier || !value.trackingNumber)
    ) {
      context.addIssue({
        code: "custom",
        message: "Carrier and tracking number are required when shipping.",
      });
    }
  });


export type ShopCheckoutItem = {
  productId: string;
  professionalId: string;
  professionalName: string;
  name: string;
  pricePence: number;
  quantity: number;
};

export type ShopCheckout = {
  id: string;
  stripeSessionId: string | null;
  expiresAt: string;
  totalPence: number;
  itemCount: number;
  items: ShopCheckoutItem[];
};

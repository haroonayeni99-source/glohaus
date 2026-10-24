import { z } from "zod";
import type { ProductOrder } from "./domain";

export const sellerSettingsSchema = z
  .object({
    away: z.boolean(),
    awayUntil: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.awayUntil &&
      (!value.away ||
        Date.parse(value.awayUntil) <= Date.now() ||
        Date.parse(value.awayUntil) > Date.now() + 366 * 86400000)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Choose a future return time within a year, or leave it open-ended.",
        path: ["awayUntil"],
      });
    }
  });

export type SellerSettings = z.infer<typeof sellerSettingsSchema>;
export const defaultSellerSettings: SellerSettings = {
  away: false,
  awayUntil: null,
};

export function sellerIsAway(settings: SellerSettings, now = Date.now()) {
  return (
    settings.away &&
    (!settings.awayUntil || Date.parse(settings.awayUntil) > now)
  );
}

// A fact-based template, deliberately not presented as AI. No invented benefits,
// ingredients, safety claims, reviews or suitability statements are generated.
export function productDescriptionDraft(name: string, facts: string) {
  const title = name.trim();
  const detail = facts.trim();
  if (title.length < 2 || !detail) return null;
  return `${title}\n\n${detail}`.slice(0, 1200);
}

export type SellerOverview = {
  publishedProducts: number;
  lowStockProducts: number;
  openOrders: number;
  sales30DaysPence: number;
  paidOrders30Days: number;
  refundOrders30Days: number;
};

export type SellerProductInsight = {
  productId: string;
  name: string;
  units: number;
  salesPence: number;
};

export function orderReplyDraft(
  order: Pick<ProductOrder, "status" | "trackingCarrier" | "trackingNumber">,
  topic: "status" | "issue",
) {
  if (topic === "issue")
    return "Thank you for letting me know about the issue with your order. Please describe what happened and keep any relevant photos and packaging. I’ll review the details with you. You can also contact GLOHAUS order support for help.";
  if (order.status === "shipped" || order.status === "delivered")
    return `Your order has been dispatched.${order.trackingCarrier && order.trackingNumber ? ` Carrier: ${order.trackingCarrier}. Tracking number: ${order.trackingNumber}.` : ""} You can view the tracking details in your GLOHAUS orders. Please check the carrier’s latest updates for delivery information.`;
  if (order.status === "refund_pending")
    return "Your refund is being processed. The order status will update after the payment provider confirms it. You can check the latest status in your GLOHAUS orders.";
  if (order.status === "refunded")
    return "The payment provider has confirmed your refund. Your bank may take additional time to show the returned funds. You can review the status in your GLOHAUS orders.";
  if (order.status === "cancelled")
    return "Your order is marked as cancelled. Please check your GLOHAUS order for its payment and refund status, or contact GLOHAUS order support if you need help.";
  return "Thank you for your order. It is being prepared. Tracking will be added to your GLOHAUS order once it has been dispatched.";
}

import "server-only";
import { unstable_cache } from "next/cache";
import type Stripe from "stripe";
import { paymentReady, stripe } from "./stripe";
import { professionalPlanCatalogue } from "@/modules/professionals/plans";
import type { PlanOffer, PlanKey } from "@/modules/professionals/plan-pricing";

export function configuredPlanPrice(plan: PlanKey): string | null {
  if (plan === "pro") return process.env.STRIPE_PRO_MONTHLY_PRICE_ID || null;
  if (plan === "premium")
    return process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || null;
  return null;
}

export function matchesMonthlyPlanPrice(
  price: Stripe.Price,
  amountPence: number,
): boolean {
  return (
    price.active &&
    price.currency === "gbp" &&
    price.unit_amount === amountPence &&
    price.type === "recurring" &&
    price.billing_scheme === "per_unit" &&
    !price.transform_quantity &&
    price.recurring?.interval === "month" &&
    price.recurring.interval_count === 1 &&
    price.recurring.usage_type === "licensed"
  );
}

const priceMatches = unstable_cache(
  async (id: string, amount: number) => {
    try {
      return matchesMonthlyPlanPrice(
        await stripe().prices.retrieve(id),
        amount,
      );
    } catch {
      return false;
    }
  },
  ["professional-monthly-price-check-v1"],
  { revalidate: 60 },
);

export async function professionalPlanOffers(): Promise<PlanOffer[]> {
  const catalogue = await professionalPlanCatalogue();
  return Promise.all(
    catalogue.map(async (plan) => {
      const priceId = configuredPlanPrice(plan.key);
      const ready =
        plan.key === "starter" ||
        Boolean(
          priceId &&
          paymentReady() &&
          (await priceMatches(priceId, plan.monthlyPricePence)),
        );
      return { ...plan, priceId, ready };
    }),
  );
}

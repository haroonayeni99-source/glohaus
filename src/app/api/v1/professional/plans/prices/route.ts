import { json } from "@/lib/http";
import { professionalPlanOffers } from "@/modules/payments/plan-offers";
export const dynamic = "force-dynamic";
export async function GET() {
  const offers = await professionalPlanOffers();
  // Public monthly prices only; no commission, account or provider details.
  return json({
    plans: offers.map((offer) => ({
      key: offer.key,
      name: offer.name,
      monthlyPricePence: offer.monthlyPricePence,
      available: offer.ready,
    })),
  });
}

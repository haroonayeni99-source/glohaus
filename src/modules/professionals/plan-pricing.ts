export type PlanKey = "starter" | "pro" | "premium";
export type PlanDefinition = {
  key: PlanKey;
  name: string;
  monthlyPricePence: number;
  serviceCommissionBasisPoints: number;
};
export type PlanOffer = PlanDefinition & {
  priceId: string | null;
  ready: boolean;
};

// Confirmed live billing amounts; the database catalogue is authoritative.
export const defaultPlans: PlanDefinition[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyPricePence: 0,
    serviceCommissionBasisPoints: 800,
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPricePence: 999,
    serviceCommissionBasisPoints: 600,
  },
  {
    key: "premium",
    name: "Premium",
    monthlyPricePence: 1999,
    serviceCommissionBasisPoints: 400,
  },
];

export const planPercent = (basisPoints: number) =>
  (basisPoints / 100).toFixed(basisPoints % 100 ? 2 : 0) + "%";

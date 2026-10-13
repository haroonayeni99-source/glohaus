import "server-only";
import { withIdentity } from "@/lib/db";
import { defaultPlans, type PlanDefinition } from "./plan-pricing";

export async function professionalPlanCatalogue(): Promise<PlanDefinition[]> {
  if (!process.env.DATABASE_URL) return defaultPlans;
  try {
    return await withIdentity(
      "",
      async (db) =>
        (
          await db.query<PlanDefinition>(
            `SELECT plan_key AS key,display_name AS name,monthly_price_pence AS "monthlyPricePence",
       service_commission_basis_points AS "serviceCommissionBasisPoints"
       FROM beauty.professional_plan_definitions WHERE active ORDER BY monthly_price_pence`,
          )
        ).rows,
    );
  } catch {
    return defaultPlans;
  }
}

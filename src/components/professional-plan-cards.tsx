import { money } from "@/modules/professionals/domain";
import {
  planPercent,
  type PlanDefinition,
  type PlanKey,
} from "@/modules/professionals/plan-pricing";

export function ProfessionalPlanCards({
  plans,
  currentPlan,
}: {
  plans: PlanDefinition[];
  currentPlan: PlanKey;
}) {
  return (
    <section className="professional-plan-grid" aria-label="Professional plans">
      {plans.map((plan) => (
        <article key={plan.key}>
          <strong>
            {plan.key === "starter" ? "Starter · Free" : plan.name}
          </strong>
          <span>{money(plan.monthlyPricePence)}/month</span>
          <span>
            {planPercent(plan.serviceCommissionBasisPoints)} GLOHAUS service
            commission
          </span>
          {currentPlan === plan.key && <small>Current plan</small>}
        </article>
      ))}
    </section>
  );
}

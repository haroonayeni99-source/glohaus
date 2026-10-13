import { z } from "zod";
export const commissionActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      kind: z.enum(["platform", "individual"]),
      professionalId: z.uuid().nullable(),
      scope: z.enum([
        "all",
        "verified",
        "unverified",
        "starter",
        "pro",
        "premium",
      ]),
      basisPoints: z.number().int().min(0).max(5000),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      reason: z.string().trim().min(5).max(500),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel"),
      ruleId: z.uuid(),
      cancelledFrom: z.iso.datetime({ offset: true }),
      reason: z.string().trim().min(5).max(500),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("enrol"),
      professionalId: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
      reason: z.string().trim().min(5).max(500),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("qualify"),
      professionalId: z.uuid(),
      reason: z.string().trim().min(5).max(500),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.enum(["activation", "emergency"]),
      enabled: z.boolean(),
      reason: z.string().trim().min(5).max(500),
      confirmed: z.literal(true),
    })
    .strict(),
]);
export type CommissionAction = z.infer<typeof commissionActionSchema>;
export type CommissionResolution = {
  basisPoints: number;
  standardBasisPoints: number;
  ruleId: string | null;
  ruleReference: string;
  pricingVersion: string;
  expiresAt: string | null;
};
export type CommissionRule = {
  id: string;
  kind: string;
  professional_id: string | null;
  scope: string;
  basis_points: number;
  starts_at: string;
  ends_at: string;
  cancelled_from: string | null;
  reason: string;
  created_by: string;
  created_at: string;
};
export type FoundingParticipant = {
  professional_id: string;
  trial_rule_id: string;
  reward_rule_id: string | null;
  questionnaire: {
    experience: string;
    improve: string;
    useAgain: string;
  } | null;
  submitted_at: string | null;
  qualified_at: string | null;
};
export type CommissionOverview = {
  asOf: string;
  settings: {
    enabled: boolean;
    new_promotions_enabled: boolean;
    version: number;
  };
  professionals: {
    id: string;
    name: string;
    effective: CommissionResolution;
  }[];
  rules: CommissionRule[];
  founding: FoundingParticipant[];
  metrics: {
    commissionEarnedPence: number;
    waivedPence: number;
    capturedPence: number;
    paymentCostsPence: number;
    costsPending: number;
    legacyWithoutTerms: number;
  };
  performance: {
    rule_reference: string;
    paid_bookings: number;
    waived_pence: number;
    earned_pence: number;
    provider_cost_pence: number;
  }[];
  audit: {
    actor_user_id: string;
    action: string;
    reason: string;
    previous_state: Record<string, unknown>;
    new_state: Record<string, unknown>;
    created_at: string;
  }[];
};
export type ProfessionalCommissionOverview = {
  effective: CommissionResolution;
  enabled: boolean;
  notices: { body: string; effective_at: string; created_at: string }[];
  founding: FoundingParticipant | null;
  bookings: {
    booking_id: string;
    basis_points: number;
    commission_pence: number;
    rule_reference: string;
    pricing_version: string;
    agreed_at: string;
  }[];
};
export const simulationSchema = z
  .object({
    professionalId: z.uuid(),
    scenario: z.enum(["applied", "zero", "two", "standard"]).optional(),
    atTime: z.iso.datetime({ offset: true }),
    servicePence: z.number().int().min(1).max(10000000),
    depositPence: z.number().int().min(0).max(10000000),
    bookings: z.number().int().min(1).max(10000),
    providerBasisPoints: z.number().int().min(0).max(10000),
    providerFixedPence: z.number().int().min(0).max(10000),
    refundPence: z.number().int().min(0).max(10000000),
  })
  .strict();
export function simulateCommission(
  input: z.infer<typeof simulationSchema>,
  rule: CommissionResolution,
  customerFeePence: number,
  verified: boolean,
) {
  if (input.scenario && input.scenario !== "applied") {
    const basisPoints =
      input.scenario === "zero"
        ? 0
        : input.scenario === "two"
          ? 200
          : rule.standardBasisPoints;
    rule = {
      ...rule,
      basisPoints,
      ruleId: null,
      ruleReference: `hypothetical:${input.scenario}`,
      pricingVersion: "simulation-only",
      expiresAt: null,
    };
  }
  const commissionPence = Math.floor(
    (input.servicePence * rule.basisPoints + 5000) / 10000,
  );
  const chargePence = input.depositPence + customerFeePence;
  const providerCostPence =
    Math.floor((chargePence * input.providerBasisPoints + 5000) / 10000) +
    input.providerFixedPence;
  const collectedPence = Math.min(commissionPence, input.depositPence);
  const professionalPendingPence = Math.max(
    0,
    input.depositPence - collectedPence,
  );
  const problems: string[] = [];
  if (
    verified
      ? input.depositPence < Math.ceil(input.servicePence * 0.15) ||
        input.depositPence > Math.floor(input.servicePence * 0.4)
      : input.depositPence !== input.servicePence
  )
    problems.push(
      verified
        ? "Verified professional deposits must be between 15% and 40%."
        : "Unverified bookings retain existing full prepayment rules.",
    );
  if (commissionPence > input.depositPence)
    problems.push(
      "The deposit does not cover commission. This promoted booking will be blocked.",
    );
  if (input.refundPence > chargePence)
    problems.push("Refund exceeds the amount paid.");
  return {
    rule,
    commissionPence,
    chargePence,
    collectedPence,
    professionalPendingPence,
    providerCostPence,
    platformNetPence: customerFeePence + collectedPence - providerCostPence,
    waivedPence: Math.max(
      0,
      Math.floor(
        (input.servicePence * rule.standardBasisPoints + 5000) / 10000,
      ) - commissionPence,
    ),
    professionalAfterRefundPence: Math.max(
      0,
      professionalPendingPence - input.refundPence,
    ),
    refundObligationPence: Math.max(
      0,
      input.refundPence - professionalPendingPence,
    ),
    totalCommissionPence: commissionPence * input.bookings,
    totalProviderCostPence: providerCostPence * input.bookings,
    problems,
    estimated: true,
  };
}
export type CommissionSimulation = ReturnType<typeof simulateCommission>;

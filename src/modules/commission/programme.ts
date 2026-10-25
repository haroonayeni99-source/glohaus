import { z } from "zod";
export type ProgrammeOverview = {
  programme: {
    state: "open" | "closed" | "retired";
    updated_at: string;
    retired_at: string | null;
  };
  pricingDraft: {
    status: "draft";
    professional_basis_points: number;
    platform_first_basis_points: number;
    returning_basis_points: number;
  };
};
const reason = z.string().trim().min(5).max(500);
export const programmeActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.enum(["open", "close"]),
      reason,
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("retire"),
      reason,
      confirmed: z.literal(true),
      confirmation: z.literal("PERMANENTLY RETIRE FOUNDING PROGRAMME"),
    })
    .strict(),
  z
    .object({
      action: z.literal("pricing_draft"),
      reason,
      confirmed: z.literal(true),
      professionalBasisPoints: z.number().int().min(0).max(5000),
      platformFirstBasisPoints: z.number().int().min(0).max(5000),
      returningBasisPoints: z.number().int().min(0).max(5000),
    })
    .strict(),
]);

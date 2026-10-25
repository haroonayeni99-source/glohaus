import { z } from "zod";

const common = {
  professionalId: z.uuid(),
  categoryId: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
};
export const regulatoryApprovalSchema = z.discriminatedUnion("status", [
  z.object({ ...common, status: z.literal("revoked") }).strict(),
  z
    .object({
      ...common,
      status: z.literal("approved"),
      registrationReference: z.string().trim().min(2).max(120),
      validUntil: z.iso.date(),
      registerChecked: z.literal(true),
      insuranceChecked: z.literal(true),
      safeguardsChecked: z.literal(true),
      dentistConfirmed: z.boolean(),
    })
    .strict(),
]);
export type RegulatoryOverview = {
  categories: {
    id: string;
    name: string;
    active: boolean;
    kind: "dentistry" | "tattoo";
  }[];
  approvals: {
    professional_id: string;
    category_id: string;
    business_name: string;
    status: "approved" | "revoked";
    registration_reference: string;
    valid_until: string;
    expired: boolean;
    updated_at: string;
  }[];
};

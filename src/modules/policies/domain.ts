import { z } from "zod";

export const preparationOptions = [
  "clean_hair",
  "remove_makeup",
  "bring_products",
  "consultation",
  "patch_test",
  "reference_photos",
] as const;
export const policyFieldsSchema = z
  .object({
    graceMinutes: z
      .union([
        z.literal(0),
        z.literal(5),
        z.literal(10),
        z.literal(15),
        z.literal(20),
        z.literal(30),
      ])
      .nullable(),
    lateInstructions: z.string().trim().max(1000),
    cancellationHours: z
      .union([
        z.literal(6),
        z.literal(12),
        z.literal(24),
        z.literal(48),
        z.literal(72),
      ])
      .nullable(),
    depositPercent: z.number().int().min(15).max(40).nullable(),
    rescheduleHours: z
      .union([
        z.literal(6),
        z.literal(12),
        z.literal(24),
        z.literal(48),
        z.literal(72),
      ])
      .nullable(),
    maxReschedules: z.number().int().min(0).max(5).nullable(),
    freeReschedule: z.boolean().nullable(),
    guests: z.enum(["allowed", "none", "approval"]).nullable(),
    children: z.enum(["allowed", "none", "approval"]).nullable(),
    preparation: z.array(z.enum(preparationOptions)).max(6),
    preparationText: z.string().trim().max(1500),
    requireReferences: z.boolean().nullable(),
    requireConsultation: z.boolean().nullable(),
    requirePatchTest: z.boolean().nullable(),
    restrictions: z.string().trim().max(1500),
    customRules: z.string().trim().max(3000),
  })
  .strict();
export type PolicyFields = z.infer<typeof policyFieldsSchema>;
export const defaultPolicy: PolicyFields = {
  graceMinutes: 10,
  lateInstructions: "",
  cancellationHours: 24,
  depositPercent: null,
  rescheduleHours: 24,
  maxReschedules: 1,
  freeReschedule: true,
  guests: "approval",
  children: "approval",
  preparation: [],
  preparationText: "",
  requireReferences: false,
  requireConsultation: false,
  requirePatchTest: false,
  restrictions: "",
  customRules: "",
};
export const inheritedPolicy: PolicyFields = {
  ...defaultPolicy,
  graceMinutes: null,
  cancellationHours: null,
  rescheduleHours: null,
  maxReschedules: null,
  freeReschedule: null,
  guests: null,
  children: null,
  requireReferences: null,
  requireConsultation: null,
  requirePatchTest: null,
};
/** Mirrors server precedence for previews; checkout always resolves again in PostgreSQL. */
export function mergePolicyFields(
  general: PolicyFields,
  specific?: PolicyFields,
): PolicyFields {
  const extra = specific
    ? Object.fromEntries(
        Object.entries(specific).filter(([, value]) => value !== null),
      )
    : {};
  const combined = { ...defaultPolicy, ...general, ...extra } as PolicyFields;
  return {
    ...combined,
    lateInstructions: specific?.lateInstructions || general.lateInstructions,
    preparation: Array.from(
      new Set([...general.preparation, ...(specific?.preparation || [])]),
    ),
    preparationText: [general.preparationText, specific?.preparationText]
      .filter(Boolean)
      .join("\n"),
    restrictions: [general.restrictions, specific?.restrictions]
      .filter(Boolean)
      .join("\n"),
    requireReferences: Boolean(
      general.requireReferences || specific?.requireReferences,
    ),
    requireConsultation: Boolean(
      general.requireConsultation || specific?.requireConsultation,
    ),
    requirePatchTest: Boolean(
      general.requirePatchTest || specific?.requirePatchTest,
    ),
  };
}
export const policySaveSchema = z
  .object({
    serviceId: z.uuid().nullable(),
    action: z.enum(["save", "publish", "unpublish"]),
    expectedRevision: z.number().int().min(0),
    policy: policyFieldsSchema,
  })
  .strict();
export const policyAdminSchema = z
  .object({
    action: z.enum(["approve", "reject", "flag", "retention"]),
    versionId: z.uuid().optional(),
    bookingId: z.uuid().optional(),
    approved: z.boolean().optional(),
    reason: z.string().trim().min(5).max(1000),
    confirmed: z.literal(true),
  })
  .strict();
export const policyBookingSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("approve_reschedule"),
      eventId: z.uuid(),
      accepted: z.boolean(),
      reason: z.string().trim().min(5).max(500).optional(),
    })
    .strict()
    .refine((v) => v.accepted || Boolean(v.reason), {
      message: "Explain why the rescheduling request is declined.",
    }),
  z
    .object({
      action: z.literal("reschedule"),
      startsAt: z.iso.datetime({ offset: true }),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("late"),
      decision: z.enum(["proceed", "offer_shorten", "cancel"]),
      shortenMinutes: z.number().int().min(5).max(240).optional(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("accept_shorten"),
      eventId: z.uuid(),
      accepted: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("requirements"),
      preparationInfo: z.string().trim().max(1500),
      healthInfo: z.string().trim().max(1000),
      healthConsent: z.boolean(),
      consultationDone: z.boolean(),
      patchTestDone: z.boolean(),
    })
    .strict()
    .refine((v) => !v.healthInfo || v.healthConsent, {
      message:
        "Explicit consent is required to share optional health information.",
    }),
  z.object({ action: z.literal("withdraw_health") }).strict(),
  z.object({ action: z.literal("ready"), confirmed: z.literal(true) }).strict(),
  z
    .object({
      action: z.literal("retention"),
      lossPence: z.number().int().min(1).max(1000000),
      evidence: z.string().trim().min(20).max(2000),
      mitigation: z.string().trim().min(20).max(1000),
    })
    .strict(),
]);
export type PolicyPreview = {
  serviceOptions?:import("@/modules/taxonomy/domain").TaxonomyQuote;
  token: string;
  generalVersionId: string | null;
  serviceVersionId: string | null;
  rules: PolicyFields;
  generalCustomRules: string;
  serviceCustomRules: string;
  timezone: string;
  pricePence: number;
  depositPence: number;
  bookingFeePence: number;
  fullPrepayment: boolean;
  publishedAt: string | null;
};
export type PolicyVersion = {
  id: string;
  scope_id: string;
  version: number;
  content: PolicyFields;
  created_at: string;
  published_at: string | null;
  review_status: string;
  review_reason: string | null;
};
export type PolicyScope = {
  id: string;
  service_id: string | null;
  draft: PolicyFields;
  revision: number;
  updated_at: string;
  published_version_id: string | null;
};
export type PolicyWorkspace = {
  scopes: PolicyScope[];
  versions: PolicyVersion[];
  services: { id: string; name: string }[];
};
export type PolicyEvent = {
  id: string;
  kind: string;
  created_at: string;
  actor_id: string;
  details: Record<string, unknown>;
};
export type BookingPolicy = {
  terms: {
    snapshot: PolicyPreview;
    acknowledged_at: string | null;
    acknowledgement_source: string;
    original_starts_at: string;
    price_pence: number;
    deposit_pence: number;
  } | null;
  events: PolicyEvent[];
  assessment: {
    mandatoryFullRefund: boolean;
    noticeHours: number;
    timely: boolean;
    coolingOff: boolean;
    minimumRefundPence: number;
    remainingPaidPence: number;
    reviewRequired: boolean;
  };
  requirements: {
    preparation_info: string;
    health_info: string | null;
    health_consent_at: string | null;
    consultation_done: boolean;
    patch_test_done: boolean;
    professional_ready_at: string | null;
  } | null;
  photos: { id: string; created_at: string }[];
  retention: {
    status: string;
    loss_pence: number;
    evidence: string;
    mitigation: string;
    review_reason: string | null;
  } | null;
};
export type PolicyAdminOverview = {
  versions: (PolicyVersion & {
    professional_id: string;
    professional_name: string;
    service_name: string | null;
    current: boolean;
  })[];
  bookings: {
    id: string;
    professional_name: string;
    customer_name: string;
    service_name: string;
    acknowledged_at: string | null;
    snapshot: PolicyPreview;
  }[];
  retentions: {
    booking_id: string;
    professional_name: string;
    customer_name: string;
    loss_pence: number;
    evidence: string;
    mitigation: string;
    status: string;
  }[];
  audit: {
    id: string;
    action: string;
    version_id: string | null;
    actor_id: string;
    actor_name: string;
    professional_name: string;
    reason: string | null;
    created_at: string;
  }[];
  disputes: {
    id: string;
    booking_id: string;
    status: string;
    amount_pence: number;
    professional_name: string;
    updated_at: string;
  }[];
};

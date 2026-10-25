import { z } from "zod";

export const caseKinds = [
  "general",
  "privacy_request",
  "access",
  "correction",
  "erasure",
  "restriction",
  "objection",
  "portability",
  "privacy_complaint",
  "complaint",
] as const;
export const identityReviews = [
  "unreviewed",
  "pending",
  "verified",
  "not_needed",
] as const;
export const supportOperationsInput = z
  .object({
    id: z.uuid(),
    kind: z.enum(caseKinds),
    identity: z.enum(identityReviews),
    holdReason: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !v || v.length >= 5),
    nextReviewAt: z.union([z.literal(""), z.iso.date()]),
    receivedOn: z.iso.date(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export type SupportOperations = {
  id: string;
  receivedOn: string;
  kind: (typeof caseKinds)[number];
  identity: (typeof identityReviews)[number];
  holdReason: string;
  nextReviewAt: string | null;
  closedAt: string | null;
  rightsDueAt: string | null;
  evidenceReviewAt: string | null;
  caseReviewAt: string | null;
};
export type SupportOperationsQueue = {
  rightsPending: number;
  items: {
    id: string;
    topic: string;
    status: string;
    kind: string;
    rightsDueAt: string | null;
    onHold: boolean;
    reviewAt: string | null;
  }[];
};

export const retentionSchedule = [
  [
    "Support messages and complaint decisions",
    "Review 24 months after final closure. Erase or anonymise when no longer needed; record any justified exception.",
  ],
  [
    "Support screenshots and evidence",
    "Review 90 days after closure. Remove unnecessary copies earlier; preserve evidence needed for an unresolved dispute or documented legal hold.",
  ],
  [
    "Privacy requests and identity checks",
    "Keep the request, response and proportionate verification record with the case. Avoid collecting identity documents where account checks are enough.",
  ],
  [
    "Accounts and public profiles",
    "Keep while the account is used. Review inactive accounts after 24 months; resolve bookings, disputes and legal obligations before eligible removal.",
  ],
  [
    "Booking, payment and tax records",
    "Keep the minimum accounting and tax records for six years after the relevant financial/tax year ends, or longer where legally required. Review annually with the accountant; no financial records are deleted by this workflow.",
  ],
  [
    "Acquisition and referral evidence",
    "Review identifiable journey/source evidence after 24 months, or earlier on a valid request. Preserve only evidence still needed for an active dispute or justified audit purpose.",
  ],
  [
    "Marketing consent and suppression",
    "Honour opt-outs immediately. Keep the minimum suppression and consent evidence needed to respect the choice and demonstrate past consent; review annually.",
  ],
] as const;

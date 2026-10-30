import { z } from "zod";
export const customerRebookingConsent = z
  .object({
    professionalId: z.uuid(),
    channel: z.literal("email"),
    enabled: z.boolean(),
  })
  .strict();
export const professionalRebookingSettings = z.union([
  z
    .object({
      paused: z.boolean(),
      delayDays: z.number().int().min(14).max(180),
    })
    .strict(),
  z
    .object({
      serviceId: z.uuid(),
      delayDays: z.number().int().min(14).max(180).nullable(),
    })
    .strict(),
]);
export type CustomerRebookingScope = {
  professionalId: string;
  businessName: string;
  channel: "email";
  enabled: boolean;
};
export type ProfessionalRebookingScope = {
  paused: boolean;
  delayDays: number;
  services: { serviceId: string; name: string; delayDays: number | null }[];
};

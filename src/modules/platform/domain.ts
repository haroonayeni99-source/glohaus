import { z } from "zod";
export const labelKeys = [
  "Professional",
  "Professionals",
  "Hair",
  "Nails",
  "Makeup",
  "Lashes & brows",
  "Skin",
] as const;
export type Labels = Record<(typeof labelKeys)[number], string>;
export const defaultLabels: Labels = {
  Professional: "Beauty Professional",
  Professionals: "Beauty Professionals",
  Hair: "Hair",
  Nails: "Nails",
  Makeup: "Makeup",
  "Lashes & brows": "Lashes & brows",
  Skin: "Skin",
};
export const labelsSchema = z
  .object({
    labels: z
      .object({
        Professional: z.string().trim().min(2).max(40),
        Professionals: z.string().trim().min(2).max(40),
        Hair: z.string().trim().min(2).max(40),
        Nails: z.string().trim().min(2).max(40),
        Makeup: z.string().trim().min(2).max(40),
        "Lashes & brows": z.string().trim().min(2).max(40),
        Skin: z.string().trim().min(2).max(40),
      })
      .strict(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();

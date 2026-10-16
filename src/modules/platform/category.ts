import { z } from "zod";
export const categorySchema = z
  .object({
    id: z.uuid().nullable().optional(),
    name: z.string().trim().min(2).max(60),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(10000),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();

import { z } from "zod";
export const customerNameSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(59).default(""),
  })
  .strict();
export function customerNameFromMetadata(metadata: unknown) {
  const value =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : {};
  const parsed = customerNameSchema.safeParse({
    firstName: value.first_name,
    lastName: value.last_name ?? "",
  });
  return parsed.success ? parsed.data : undefined;
}

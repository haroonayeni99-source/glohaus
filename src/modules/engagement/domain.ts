import { z } from "zod";
export const engagementSchema = z
  .object({ liked: z.boolean(), saved: z.boolean() })
  .strict();
export type Engagement = z.infer<typeof engagementSchema>;
export type EngagementMap = Record<string, Engagement>;
export function readDeviceEngagement(raw: string | null): EngagementMap {
  if (!raw || raw.length > 200000) return {};
  try {
    const parsed = z
      .record(z.string().max(100), engagementSchema)
      .safeParse(JSON.parse(raw));
    return parsed.success
      ? Object.fromEntries(Object.entries(parsed.data).slice(-1000))
      : {};
  } catch {
    return {};
  }
}

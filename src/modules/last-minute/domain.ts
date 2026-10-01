import { z } from "zod";

export const lastMinuteInputSchema = z.object({
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  caption: z.string().trim().min(1).max(160),
}).strict();

export type LastMinuteInput = z.infer<typeof lastMinuteInputSchema>;

export type LastMinuteSlot = {
  id: string;
  professional_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  caption: string;
  expires_at: string;
  slug: string;
  business_name: string;
  city: string;
  category: string;
  service_name: string;
  price_pence: number;
  duration_minutes: number;
};

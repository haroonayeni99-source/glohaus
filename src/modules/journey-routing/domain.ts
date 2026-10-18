import { z } from "zod";

export const transportSchema = z.enum([
  "driving",
  "transit",
  "walking",
  "bicycling",
]);
export const originSchema = z.union([
  z.object({ address: z.string().trim().min(3).max(300) }).strict(),
  z
    .object({
      latitude: z.number().finite().min(-85).max(85),
      longitude: z.number().finite().min(-180).max(180),
    })
    .strict(),
]);
export type JourneyOrigin = z.infer<typeof originSchema>;
export type Transport = z.infer<typeof transportSchema>;
export const routeInputSchema = z
  .object({
    origin: originSchema,
    mode: transportSchema,
    bufferMinutes: z.number().int().min(0).max(120),
    reminders: z.boolean(),
    automaticUpdates: z.boolean(),
    providerConsent: z.literal(true),
  })
  .strict()
  .refine((v) => !v.automaticUpdates || v.reminders, {
    message: "Automatic updates require optional reminders",
  });
export type RouteInput = z.infer<typeof routeInputSchema>;
export type RouteContext = {
  bookingId: string;
  token: string;
  startsAt: string;
  latitude: number;
  longitude: number;
  departureAt: string | null;
  durationMinutes: number | null;
  bufferMinutes: number | null;
  mode: Transport | null;
  ciphertext?: string;
};
export type RouteStatus = {
  enabled: boolean;
  automaticUpdates: boolean;
  checkedAt: string | null;
  lastError: string | null;
  configured?: boolean;
};
export type RoutingOverview = {
  enabled: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  refreshMinutes: number;
  changeMinutes: number;
  usedToday: number;
  usedMonth: number;
  failedToday: number;
  activeRefreshes: number;
  schedulerReady: boolean;
  registeredDevices: number;
  pushAccepted: number;
  deviceDisplayed: number;
  deviceClicked: number;
  emailsDelivered: number;
  configured?: boolean;
};

export class RoutingError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

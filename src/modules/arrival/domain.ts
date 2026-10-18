import { z } from "zod";

export const arrivalActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("shown"),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("configure"),
      enabled: z.boolean(),
      latitude: z.number().finite().min(-85).max(85),
      longitude: z.number().finite().min(-180).max(180),
      instructions: z.string().trim().max(1000),
      expectedVersion: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal("acknowledge"),
      version: z.number().int().positive(),
    })
    .strict(),
  z.object({ action: z.literal("consent"), enabled: z.boolean() }).strict(),
  z
    .object({
      action: z.literal("reading"),
      latitude: z.number().finite().min(-85).max(85),
      longitude: z.number().finite().min(-180).max(180),
      accuracyM: z.number().finite().min(0).max(5000),
      observedAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z.object({ action: z.literal("manual") }).strict(),
  z.object({ action: z.literal("attendance") }).strict(),
  z.object({ action: z.literal("started") }).strict(),
  z
    .object({
      action: z.literal("dispute"),
      reason: z.string().trim().min(10).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("late"),
      eta: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("plan"),
      durationMinutes: z.number().int().min(1).max(1440),
      bufferMinutes: z.number().int().min(0).max(120),
      mode: z.enum(["driving", "transit", "walking", "bicycling"]),
      reminders: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal("reminders"), enabled: z.boolean() }).strict(),
]);
export type ArrivalAction = z.infer<typeof arrivalActionSchema>;
export type ArrivalConfig = {
  schedulerReady?: boolean;
  smartArrival: boolean;
  journeyPlanner: boolean;
  journeySharing: boolean;
  departureReminders: boolean;
  radiusM: number;
  defaultBuffer: number;
};
export type ArrivalState = {
  professional: boolean;
  config: ArrivalConfig;
  startsAt: string;
  endsAt: string;
  status: string;
  windowOpen: boolean;
  graceMinutes: number;
  lateInstructions: string;
  arrival: null | {
    enabled: boolean;
    latitude: number;
    longitude: number;
    instructions: string;
    version: number;
    radius_m: number;
    acknowledged_at: string | null;
    consent_at: string | null;
    detected_at: string | null;
    manual_at: string | null;
    attendance_at: string | null;
    started_at: string | null;
    accuracy_m: number | null;
    last_reading_at: string | null;
    detection_status: string;
  };
  plan: null | {
    duration_minutes: number;
    buffer_minutes: number;
    mode: string;
    reminders: boolean;
    departure_at: string;
    revision: number;
  };
  events: {
    id: string;
    kind: string;
    created_at: string;
    details: Record<string, unknown>;
  }[];
};
export function departureTime(
  startsAt: string,
  durationMinutes: number,
  bufferMinutes: number,
) {
  return new Date(
    new Date(startsAt).getTime() - (durationMinutes + bufferMinutes) * 60000,
  ).toISOString();
}
export function lateness(
  startsAt: string,
  arrivalAt: string,
  graceMinutes: number,
) {
  const minutes =
    (new Date(arrivalAt).getTime() - new Date(startsAt).getTime()) / 60000;
  return minutes <= 0
    ? "On time"
    : minutes <= graceMinutes
      ? "Within the grace period"
      : "Outside the grace period";
}
export function directionsUrl(
  destination: { latitude: number; longitude: number },
  origin: string,
  mode: string,
) {
  const query = new URLSearchParams({
    api: "1",
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: mode,
  });
  if (origin.trim()) query.set("origin", origin.trim());
  return `https://www.google.com/maps/dir/?${query}`;
}

import "server-only";
import { z } from "zod";
import {
  RoutingError,
  type JourneyOrigin,
  type RouteContext,
  type Transport,
} from "./domain";

const seconds = z
  .string()
  .regex(/^\d+(?:\.\d+)?s$/)
  .transform((s) => Number(s.slice(0, -1)))
  .pipe(z.number().nonnegative().max(86400));
const responseSchema = z.object({
  routes: z
    .array(
      z.object({
        duration: seconds.refine((s) => s > 0),
        distanceMeters: z.number().nonnegative().finite().optional(),
        warnings: z.array(z.string().max(1000)).max(20).optional(),
        legs: z
          .array(
            z.object({
              steps: z
                .array(
                  z.object({
                    staticDuration: seconds.optional(),
                    transitDetails: z
                      .object({
                        stopDetails: z.object({
                          departureTime: z.iso.datetime({ offset: true }),
                        }),
                      })
                      .optional(),
                  }),
                )
                .max(500)
                .optional(),
            }),
          )
          .max(2)
          .optional(),
      }),
    )
    .max(4)
    .optional(),
});
const travelMode = {
  driving: "DRIVE",
  transit: "TRANSIT",
  walking: "WALK",
  bicycling: "BICYCLE",
} as const;

export function googleRequest(
  origin: JourneyOrigin,
  context: RouteContext,
  mode: Transport,
  bufferMinutes: number,
  now = Date.now(),
) {
  const target = Date.parse(context.startsAt) - bufferMinutes * 60000;
  const departure = Math.max(
    now + 1000,
    context.departureAt
      ? Date.parse(context.departureAt)
      : target - (context.durationMinutes || 35) * 60000,
  );
  return {
    origin:
      "address" in origin
        ? { address: origin.address }
        : { location: { latLng: origin } },
    destination: {
      location: {
        latLng: { latitude: context.latitude, longitude: context.longitude },
      },
    },
    travelMode: travelMode[mode],
    languageCode: "en-GB",
    regionCode: "GB",
    units: "METRIC",
    ...(mode === "transit"
      ? { arrivalTime: new Date(target).toISOString() }
      : mode === "driving"
        ? {
            departureTime: new Date(departure).toISOString(),
            routingPreference: "TRAFFIC_AWARE",
          }
        : {}),
  };
}

export async function estimateRoute(
  origin: JourneyOrigin,
  context: RouteContext,
  mode: Transport,
  bufferMinutes: number,
) {
  const apiKey = process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim();
  if (!apiKey) throw new RoutingError("ROUTING_NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "routes.duration,routes.distanceMeters,routes.warnings,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails.stopDetails.departureTime",
        },
        body: JSON.stringify(
          googleRequest(origin, context, mode, bufferMinutes),
        ),
      },
    );
  } catch {
    throw new RoutingError("ROUTE_PROVIDER_UNAVAILABLE");
  }
  if (!response.ok)
    throw new RoutingError(
      response.status === 429
        ? "ROUTE_PROVIDER_LIMIT"
        : "ROUTE_PROVIDER_UNAVAILABLE",
    );
  // Provider failures and bodies are never logged: they may contain addresses.
  let raw: unknown;
  try {
    const body = await response.text();
    if (body.length > 200000) throw new Error();
    raw = JSON.parse(body);
  } catch {
    throw new RoutingError("ROUTE_PROVIDER_UNAVAILABLE");
  }
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new RoutingError("ROUTE_PROVIDER_UNAVAILABLE");
  const route = parsed.data.routes?.[0];
  if (!route) throw new RoutingError("ROUTE_NOT_FOUND");
  let durationMinutes = Math.ceil(route.duration / 60);
  if (mode === "transit") {
    let walkSeconds = 0,
      departure: string | undefined;
    for (const step of route.legs?.[0]?.steps || []) {
      if (step.transitDetails) {
        departure = step.transitDetails.stopDetails.departureTime;
        break;
      }
      walkSeconds += step.staticDuration || 0;
    }
    // Align leave reminders with the actual first service, including the walk
    // to its stop. A duration alone can miss an infrequent departure entirely.
    if (!departure) throw new RoutingError("ROUTE_NOT_FOUND");
    const leave = Date.parse(departure) - walkSeconds * 1000;
    if (leave < Date.now()) throw new RoutingError("ROUTE_NOT_FOUND");
    durationMinutes = Math.ceil(
      (Date.parse(context.startsAt) - bufferMinutes * 60000 - leave) / 60000,
    );
  }
  if (durationMinutes < 1 || durationMinutes > 1440)
    throw new RoutingError("ROUTE_NOT_FOUND");
  return {
    durationMinutes,
    travelMinutes: Math.ceil(route.duration / 60),
    distanceMeters: route.distanceMeters ?? null,
    trafficAware: mode === "driving",
    transitSchedule: mode === "transit",
    warnings: route.warnings || [],
    checkedAt: new Date().toISOString(),
    provider: "Google Maps" as const,
  };
}

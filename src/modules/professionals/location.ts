import { z } from "zod";
import { discoveryFiltersSchema } from "./discovery";

export const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-85).max(85),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
export type Coordinates = z.infer<typeof coordinatesSchema>;
export const publicLocationSchema = z.union([
  coordinatesSchema
    .extend({ confirmed: z.literal(true), source: z.enum(["pin", "device"]) })
    .strict(),
  z.object({ confirmed: z.literal(false) }).strict(),
]);
export const nearbySearchSchema = coordinatesSchema
  .extend({
    radiusMiles: z.number().min(0.5).max(100),
    query: z.string().trim().max(100),
    filters: discoveryFiltersSchema,
  })
  .strict();
export type NearbySearch = z.infer<typeof nearbySearchSchema>;
export type PublicLocation = Coordinates & {
  confirmed_at: string;
  source: "pin" | "device";
};

export function distanceMiles(a: Coordinates, b: Coordinates) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function distanceLabel(miles: number) {
  return miles < 0.1
    ? "Less than 0.1 miles away"
    : `${miles.toFixed(1)} miles away`;
}

// Web Mercator: map pins and clicked points share the same projection.
export function project(point: Coordinates, zoom: number) {
  const size = 256 * 2 ** zoom;
  const sin = Math.sin((point.latitude * Math.PI) / 180);
  return {
    x: ((point.longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}
export function unproject(x: number, y: number, zoom: number): Coordinates {
  const size = 256 * 2 ** zoom;
  return {
    longitude: (((((x / size) * 360) % 360) + 360) % 360) - 180,
    latitude: Math.max(
      -85,
      Math.min(
        85,
        (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI,
      ),
    ),
  };
}

import { coordinatesSchema } from "./location";

export type PublicDestination = {
  business_name: string;
  public_location_confirmed_at?: string | null;
  public_latitude?: number | null;
  public_longitude?: number | null;
};

export function googleMapsDirections(pro: PublicDestination): string | null {
  if (!pro.public_location_confirmed_at) return null;
  const point = coordinatesSchema.safeParse({
    latitude: pro.public_latitude,
    longitude: pro.public_longitude,
  });
  if (!point.success) return null;
  const params = new URLSearchParams({
    api: "1",
    destination: `${point.data.latitude},${point.data.longitude}`,
    dir_action: "navigate",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

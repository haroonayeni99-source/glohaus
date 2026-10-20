import type { Coordinates } from "./location";

const FULL_POSTCODE = /^(GIR\s?0AA|(?:[A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2})$/i;
const OUTWARD_CODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

/** Public postcode centroids only; no customer device location is stored. */
export async function resolvePostcodeLocation(value?: string): Promise<Coordinates | null> {
  const compact = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const full = FULL_POSTCODE.test(compact);
  if (!full && !OUTWARD_CODE.test(compact)) return null;
  const path = full ? "postcodes" : "outcodes";
  try {
    const response = await fetch(
      `https://api.postcodes.io/${path}/${encodeURIComponent(compact)}`,
      { signal: AbortSignal.timeout(3500), next: { revalidate: 86400 } },
    );
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("result" in data)) return null;
    const result = (data as { result?: unknown }).result;
    if (!result || typeof result !== "object") return null;
    const point = result as { latitude?: unknown; longitude?: unknown };
    if (typeof point.latitude !== "number" || typeof point.longitude !== "number") return null;
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
    return { latitude: point.latitude, longitude: point.longitude };
  } catch {
    return null;
  }
}

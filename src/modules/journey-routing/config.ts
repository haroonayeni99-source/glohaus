import "server-only";

// Both names are server-only. Prefer the current setup name while preserving
// installations configured before GOOGLE_ROUTES_API_KEY was introduced.
export function googleRoutesApiKey() {
  return (
    process.env.GOOGLE_ROUTES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim() ||
    ""
  );
}

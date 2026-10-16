import "server-only";
import boundaries from "./london-borough-boundaries.json";
import { londonBorough } from "./london-boroughs";

// Public OS/GLA borough outlines, rounded to five decimal places and simplified
// by at most 0.00005 degrees for discovery, not address or legal-boundary checks.
// Source and Open Government Licence attribution: docs/london-map-restoration.md.
export function boroughPolygon(location?: string): string | null {
  const name = londonBorough(location);
  if (!name) return null;
  return `(${boundaries[name].map(([lng, lat]) => `(${lng},${lat})`).join(",")})`;
}

import { withIdentity } from "@/lib/db";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { nearbySearchSchema } from "@/modules/professionals/location";
import { publicProfessionals } from "@/modules/professionals/repository";
// POST keeps a visitor's coordinates out of URLs, access logs and sitemap links.
// No persistence, cookies, background tracking or private booking data.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = nearbySearchSchema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const input = parsed.data;
    const rows = await withIdentity("", (db) =>
      publicProfessionals(db, input.query, undefined, input.filters, input),
    );
    return json({
      professionals: rows.slice(0, 100),
      truncated: rows.length > 100,
    });
  } catch (error) {
    return apiError(error);
  }
}

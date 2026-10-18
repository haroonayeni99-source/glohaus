import { z } from "zod";
import { withAdmin, withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { routingConfigured } from "@/modules/journey-routing/crypto";
import type { RoutingOverview } from "@/modules/journey-routing/domain";
const settings = z
  .object({
    enabled: z.boolean(),
    dailyLimit: z.number().int().min(1).max(10000),
    monthlyLimit: z.number().int().min(1).max(100000),
    refreshMinutes: z.number().int().min(5).max(60),
    changeMinutes: z.number().int().min(3).max(30),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export async function GET() {
  try {
    const data = await withAdmin(
      async (db) =>
        (
          await db.query<{ data: RoutingOverview }>(
            "SELECT beauty.admin_journey_routing_overview() AS data",
          )
        ).rows[0].data,
    );
    return json({ ...data, configured: routingConfigured() });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = settings.safeParse(await smallJson(request, 2048));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    const { reason, ...config } = input.data;
    await withOwner(async (db) => {
      if (config.enabled && !routingConfigured())
        throw new AccessError("UNAVAILABLE", 503);
      await db.query(
        "SELECT beauty.owner_journey_routing_settings($1::jsonb,$2)",
        [JSON.stringify(config), reason],
      );
    });
    return GET();
  } catch (e) {
    return apiError(e);
  }
}

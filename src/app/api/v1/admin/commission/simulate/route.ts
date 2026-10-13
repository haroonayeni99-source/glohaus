import { withOwner } from "@/modules/admin/repository";
import {
  simulateCommission,
  simulationSchema,
  type CommissionResolution,
} from "@/modules/commission/domain";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = simulationSchema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    return json(
      await withOwner(async (db) => {
        const row = (
          await db.query<{
            data: {
              rule: CommissionResolution;
              fee: number;
              verified: boolean;
            };
          }>("SELECT beauty.owner_simulate_commission_rule($1,$2) AS data", [
            parsed.data.professionalId,
            parsed.data.atTime,
          ])
        ).rows[0];
        return simulateCommission(
          parsed.data,
          row.data.rule,
          row.data.fee,
          row.data.verified,
        );
      }),
    );
  } catch (e) {
    return apiError(e);
  }
}

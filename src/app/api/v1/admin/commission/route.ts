import { withOwner } from "@/modules/admin/repository";
import { commissionOverview } from "@/modules/commission/repository";
import { commissionActionSchema } from "@/modules/commission/domain";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
export async function GET() {
  try {
    return json(await withOwner(commissionOverview));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = commissionActionSchema.safeParse(
      await smallJson(request, 8192),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const result = await withOwner(
      async (db) =>
        (
          await db.query<{ data: unknown }>(
            "SELECT beauty.owner_commission_action($1::jsonb) AS data",
            [JSON.stringify(parsed.data)],
          )
        ).rows[0].data,
    );
    return json(result);
  } catch (e) {
    const messages = [
      "CONFIRMATION_REQUIRED",
      "CONTROL_DISABLED",
      "INVALID_COMMISSION_RULE",
      "PROMOTIONS_STOPPED",
      "CONTRACTUAL_REWARD_PROTECTED",
      "QUESTIONNAIRE_REQUIRED",
      "PARTICIPATION_REQUIRED",
      "USE_EMERGENCY_STOP",
    ];
    if (e instanceof Error && messages.includes(e.message))
      return json({ error: { code: e.message } }, 409);
    return apiError(e);
  }
}

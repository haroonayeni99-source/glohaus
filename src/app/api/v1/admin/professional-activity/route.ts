import { z } from "zod";
import { withAdmin, withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { assertSameOrigin, json, smallJson } from "@/lib/http";
import { activityOverview } from "@/modules/professional-activity/repository";
import { activityDecisionSchema } from "@/modules/professional-activity/domain";
import { activityError } from "@/modules/professional-activity/http";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = z
      .string()
      .max(100)
      .parse(params.get("q") || "");
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(2000)
      .parse(params.get("page") || 0);
    return json(await withAdmin((db) => activityOverview(db, query, page)));
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    return activityError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = activityDecisionSchema.safeParse(
      await smallJson(request, 2048),
    );
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withOwner((db) =>
      db.query("SELECT beauty.owner_professional_activity_action($1,$2,$3)", [
        input.data.professionalId,
        input.data.action,
        input.data.reason,
      ]),
    );
    return json({ saved: true });
  } catch (error) {
    return activityError(error);
  }
}

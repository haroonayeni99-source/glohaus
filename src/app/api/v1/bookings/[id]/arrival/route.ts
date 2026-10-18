import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { arrivalActionSchema } from "@/modules/arrival/domain";
import { arrivalAction, arrivalState } from "@/modules/arrival/repository";
import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    [
      "ARRIVAL_UNAVAILABLE",
      "ARRIVAL_CHANGED",
      "ARRIVAL_WINDOW",
      "ARRIVAL_ACK_REQUIRED",
      "ARRIVAL_ALREADY_RECORDED",
      "ARRIVAL_RATE_LIMIT",
    ].includes(message)
  )
    return json({ error: { code: message } }, 409);
  return apiError(error);
}
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    return json(await withAccount(undefined, (db) => arrivalState(db, id)));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const parsed = arrivalActionSchema.safeParse(
      await smallJson(request, 4096),
    );
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    const result = await withAccount(undefined, async (db) => {
      if (parsed.data.action === "shown") {
        await db.query("SELECT beauty.arrival_prompt_shown($1,$2)", [
          id,
          parsed.data.version,
        ]);
        return arrivalState(db, id);
      }
      return arrivalAction(db, id, parsed.data);
    });
    if (
      parsed.data.action !== "shown" &&
      (parsed.data.action !== "reading" || result.arrival?.detected_at)
    )
      scheduleNotificationDelivery();
    return json(result);
  } catch (error) {
    return failure(error);
  }
}

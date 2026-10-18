import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { subscriptionSchema } from "@/modules/notifications/preferences";
import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
const actionSchema = z
  .object({ id: z.uuid(), action: z.enum(["disable", "test"]) })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await smallJson(request, 4096);
    const action = actionSchema.safeParse(input),
      subscription = subscriptionSchema.safeParse(input);
    if (!action.success && !subscription.success)
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    const data = await withAccount("customer", async (db) => {
      if (
        (subscription.success || action.data?.action === "test") &&
        (!process.env.VAPID_PUBLIC_KEY ||
          !process.env.VAPID_PRIVATE_KEY ||
          !process.env.VAPID_SUBJECT)
      )
        throw new AccessError("UNAVAILABLE", 503);
      if (subscription.success) {
        const s = subscription.data;
        return (
          await db.query<{ id: string }>(
            "SELECT beauty.save_customer_push_subscription($1,$2,$3,$4) AS id",
            [s.endpoint, s.keys.p256dh, s.keys.auth, s.label],
          )
        ).rows[0];
      }
      await db.query("SELECT beauty.customer_push_action($1,$2)", [
        action.data!.id,
        action.data!.action,
      ]);
      return { saved: true };
    });
    scheduleNotificationDelivery();
    return json(data);
  } catch (error) {
    return apiError(error);
  }
}

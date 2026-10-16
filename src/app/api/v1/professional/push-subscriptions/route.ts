import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { authorize } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import { subscriptionSchema } from "@/modules/notifications/preferences";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
const actionSchema = z
  .object({ id: z.uuid(), action: z.enum(["disable", "test"]) })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await smallJson(request, 4096);
    const action = actionSchema.safeParse(input);
    const subscription = subscriptionSchema.safeParse(input);
    if (!action.success && !subscription.success)
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    const identity = await getIdentity();
    const data = await withIdentity(identity.authId, async (db) => {
      authorize(
        await findAccount(db, identity.authId),
        identity,
        "professional",
      );
      if (
        (subscription.success || action.data?.action === "test") &&
        (!process.env.VAPID_PUBLIC_KEY ||
          !process.env.VAPID_PRIVATE_KEY ||
          !process.env.VAPID_SUBJECT)
      )
        throw new Error("PUSH_NOT_CONFIGURED");

      if (subscription.success) {
        const s = subscription.data;
        return (
          await db.query<{ id: string }>(
            "SELECT beauty.save_push_subscription($1,$2,$3,$4) AS id",
            [s.endpoint, s.keys.p256dh, s.keys.auth, s.label],
          )
        ).rows[0];
      }
      const a = action.data!;
      await db.query(
        a.action === "test"
          ? "SELECT beauty.test_push_subscription($1)"
          : "SELECT beauty.disable_push_subscription($1)",
        [a.id],
      );
      return { saved: true };
    });
    scheduleNotificationDelivery();
    return json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "PUSH_NOT_CONFIGURED")
      return json({ error: { code: "PUSH_NOT_CONFIGURED" } }, 503);
    return apiError(error);
  }
}

import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { subscriptionSchema } from "@/modules/notifications/preferences";
import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await smallJson(request, 4096);
    const test = z
      .object({ action: z.literal("test"), subscriptionId: z.uuid() })
      .strict()
      .safeParse(body);
    if (test.success && z.uuid().safeParse(id).success) {
      if (
        !process.env.VAPID_PUBLIC_KEY ||
        !process.env.VAPID_PRIVATE_KEY ||
        !process.env.VAPID_SUBJECT
      )
        throw new AccessError("UNAVAILABLE", 503);
      await withAccount("customer", (db) =>
        db.query("SELECT beauty.test_customer_journey_push($1,$2)", [
          id,
          test.data.subscriptionId,
        ]),
      );
      scheduleNotificationDelivery();
      return json({ queued: true });
    }
    const input = z
      .object({
        endpoint: z.string(),
        keys: z.unknown(),
        expirationTime: z.number().nullable().optional(),
      })
      .strict()
      .safeParse(body);
    const parsed = subscriptionSchema.safeParse(
      input.success
        ? {
            endpoint: input.data.endpoint,
            keys: input.data.keys,
            label: "Customer journey reminders",
          }
        : {},
    );
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    if (
      !process.env.VAPID_PUBLIC_KEY ||
      !process.env.VAPID_PRIVATE_KEY ||
      !process.env.VAPID_SUBJECT
    )
      throw new AccessError("UNAVAILABLE", 503);
    const data = parsed.data;
    const saved = await withAccount("customer", (db) =>
      db.query<{ id: string }>(
        "SELECT beauty.save_customer_journey_push($1,$2,$3,$4) AS id",
        [id, data.endpoint, data.keys.p256dh, data.keys.auth],
      ),
    );
    return json({ saved: true, subscriptionId: saved.rows[0].id });
  } catch (e) {
    return apiError(e);
  }
}

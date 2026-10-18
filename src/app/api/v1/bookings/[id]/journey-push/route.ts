import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { subscriptionSchema } from "@/modules/notifications/preferences";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await smallJson(request, 4096);
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
    await withAccount("customer", (db) =>
      db.query("SELECT beauty.save_customer_journey_push($1,$2,$3,$4)", [
        id,
        data.endpoint,
        data.keys.p256dh,
        data.keys.auth,
      ]),
    );
    return json({ saved: true });
  } catch (e) {
    return apiError(e);
  }
}

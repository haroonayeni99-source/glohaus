import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
export const customerPushPreference = z
  .object({
    category: z.enum([
      "bookings",
      "orders",
      "changes",
      "messages",
      "reminders",
    ]),
    push: z.boolean(),
  })
  .strict();
export async function GET() {
  try {
    const settings = await withAccount(
      "customer",
      async (db) =>
        (
          await db.query<{ data: object }>(
            "SELECT beauty.customer_notification_settings() AS data",
          )
        ).rows[0].data,
    );
    return json({
      ...settings,
      publicKey: process.env.VAPID_PUBLIC_KEY || null,
      pushConfigured: Boolean(
        process.env.VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = customerPushPreference.safeParse(await smallJson(request));
    if (!parsed.success)
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    await withAccount("customer", (db) =>
      db.query("SELECT beauty.set_customer_push_preference($1,$2)", [
        parsed.data.category,
        parsed.data.push,
      ]),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}

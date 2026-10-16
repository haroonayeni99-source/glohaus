import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
const schema = z
  .object({
    bookingId: z.uuid(),
    rating: z.number().int().min(1).max(5),
    body: z.string().trim().min(20).max(2000),
    publicName: z.string().trim().min(1).max(80),
  })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 12000));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const input = parsed.data;
    const saved = await withAccount("customer", async (db, account) => {
      const booking = await db.query(
        "SELECT id FROM beauty.bookings WHERE id=$1 AND customer_id=$2 AND status='completed' AND ends_at<=now()",
        [input.bookingId, account.id],
      );
      if (!booking.rows.length) throw new AccessError("FORBIDDEN", 403);
      return db.query(
        "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,$2,$3,$4) ON CONFLICT (booking_id) DO NOTHING RETURNING id",
        [input.bookingId, input.rating, input.body, input.publicName],
      );
    });
    if (!saved.rows.length)
      return json({ error: { code: "REVIEW_ALREADY_EXISTS" } }, 409);
    scheduleNotificationDelivery();
    return json({ saved: true }, 201);
  } catch (error) {
    // A booking may stop being eligible between the check and INSERT. RLS
    // remains the authority; this is a rejected action, not a service outage.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "42501"
    )
      return json({ error: { code: "FORBIDDEN" } }, 403);
    return apiError(error);
  }
}

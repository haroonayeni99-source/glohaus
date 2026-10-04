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
    await withAccount("customer", async (db, account) => {
      const eligible = (
        await db.query<{ ok: boolean }>(
          `SELECT EXISTS(
             SELECT 1
             FROM beauty.bookings
             WHERE id=$1
               AND customer_id=$2
               AND status='completed'
               AND completed_at IS NOT NULL
           ) AS ok`,
          [input.bookingId, account.id],
        )
      ).rows[0]?.ok;

      if (!eligible) throw new AccessError("FORBIDDEN", 403);

      await db.query(
        "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,$2,$3,$4)",
        [input.bookingId, input.rating, input.body, input.publicName],
      );
    });
    return json({ saved: true }, 201);
  } catch (error) {
    return apiError(error);
  }
}

import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
import { reviewSchema } from "@/modules/reviews/domain";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import {
  prepareReviewPhoto,
  discardReviewPhoto,
} from "@/modules/reviews/photos";
export async function POST(request: Request) {
  let photo: Awaited<ReturnType<typeof prepareReviewPhoto>> | undefined;
  let committed = false;
  try {
    assertSameOrigin(request);
    const parsed = reviewSchema.safeParse(await smallJson(request, 4250000));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const input = parsed.data;
    if (input.photo) {
      if (!process.env.BLOB_READ_WRITE_TOKEN)
        throw new AccessError("UNAVAILABLE", 503);
      await withAccount("customer", async (db, a) => {
        const allowed = await db.query(
          "SELECT id FROM beauty.bookings WHERE id=$1 AND customer_id=$2 AND status='completed' AND ends_at<=now()",
          [input.bookingId, a.id],
        );
        if (!allowed.rows.length) throw new AccessError("FORBIDDEN", 403);
      });
      try {
        photo = await prepareReviewPhoto(input.photo);
      } catch {
        throw new AccessError("INVALID_REQUEST", 400);
      }
    }
    const saved = await withAccount("customer", async (db, account) => {
      const booking = await db.query(
        "SELECT id FROM beauty.bookings WHERE id=$1 AND customer_id=$2 AND status='completed' AND ends_at<=now()",
        [input.bookingId, account.id],
      );
      if (!booking.rows.length) throw new AccessError("FORBIDDEN", 403);
      const review = await db.query<{ id: string }>(
        "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,$2,$3,$4) ON CONFLICT (booking_id) DO NOTHING RETURNING id",
        [input.bookingId, input.rating, input.body, input.publicName],
      );
      if (review.rows.length)
        await db.query(
          "INSERT INTO beauty.review_feedback(review_id,answers,private_suggestion) VALUES($1,$2::jsonb,$3)",
          [
            review.rows[0].id,
            JSON.stringify(input.answers),
            input.privateSuggestion,
          ],
        );
      if (review.rows.length && photo)
        await db.query(
          "INSERT INTO beauty.review_photos(id,review_id,blob_path,alt_text) VALUES($1,$2,$3,$4)",
          [photo.id, review.rows[0].id, photo.path, photo.altText],
        );
      return review;
    });
    if (!saved.rows.length)
      return json({ error: { code: "REVIEW_ALREADY_EXISTS" } }, 409);
    committed = true;
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
  } finally {
    if (photo && !committed)
      try {
        const uploadedId = photo.id;
        const referenced = await withAccount(
          "customer",
          async (db) =>
            (
              await db.query(
                "SELECT id FROM beauty.review_photos WHERE id=$1",
                [uploadedId],
              )
            ).rows.length > 0,
        );
        if (!referenced) await discardReviewPhoto(photo);
      } catch {
        console.warn("Review upload cleanup awaiting commit verification");
      }
  }
}

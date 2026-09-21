import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
export type ProfessionalReview = {
  id: string;
  booking_id: string;
  rating: number;
  body: string;
  public_name: string;
  moderation_status: "visible" | "hidden";
  created_at: Date;
  service_name: string;
};
export async function professionalReviews(
  db: SqlClient,
  professionalId: string,
) {
  const reviews = (
    await db.query<ProfessionalReview>(
      `SELECT r.id,r.booking_id,r.rating,r.body,r.public_name,r.moderation_status,r.created_at,b.service_name FROM beauty.reviews r JOIN beauty.bookings b ON b.id=r.booking_id WHERE b.professional_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 100`,
      [professionalId],
    )
  ).rows;
  const totals = (
    await db.query<{ count: number; average: number | null }>(
      `SELECT count(*)::integer AS count,round(avg(r.rating),1)::float AS average FROM beauty.reviews r JOIN beauty.bookings b ON b.id=r.booking_id WHERE b.professional_id=$1 AND r.moderation_status='visible' AND b.status='completed'`,
      [professionalId],
    )
  ).rows[0];
  return { reviews, totals };
}

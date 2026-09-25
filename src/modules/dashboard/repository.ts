import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { bookingPage, type BookingRecord } from "@/modules/bookings/repository";
import { professionalWallet, type WalletOverview } from "@/modules/finance/repository";

export type ProfessionalDashboard = {
  profile: {
    businessName: string;
    publicationStatus: "draft" | "published" | "hidden";
    slug: string | null;
  } | null;
  stats: {
    newBookings: number;
    upcomingAppointments: number;
    activeServices: number;
    reviewCount: number;
    rating: number | null;
    followerCount: number;
    completedBookings: number;
  };
  upcoming: BookingRecord[];
  wallet: WalletOverview | null;
};

/**
 * Every query is rooted at the authenticated professional profile passed by
 * pageAccount(). RLS remains the database boundary; these predicates make the
 * intended scope explicit so this repository cannot become a cross-business
 * reporting query when it grows.
 */
export async function professionalDashboard(
  db: SqlClient,
  professionalId: string,
): Promise<ProfessionalDashboard> {
  const [profileResult, statsResult, reviewResult, bookings] =
    await Promise.all([
      db.query<{
        business_name: string;
        publication_status: "draft" | "published" | "hidden";
        slug: string | null;
      }>(
        "SELECT business_name,publication_status,slug FROM beauty.professional_profiles WHERE id=$1",
        [professionalId],
      ),
      db.query<{
        new_bookings: number;
        upcoming_appointments: number;
        active_services: number;
        follower_count: number;
        completed_bookings: number;
      }>(
        `SELECT
          (SELECT count(*)::integer FROM beauty.bookings b
            WHERE b.professional_id=$1
              AND b.created_at >= date_trunc('day', now())
              AND b.status IN ('payment_pending','confirmed')) AS new_bookings,
          (SELECT count(*)::integer FROM beauty.bookings b
            WHERE b.professional_id=$1
              AND b.ends_at > now()
              AND (b.status='confirmed' OR (b.status='payment_pending' AND b.hold_expires_at > now()))) AS upcoming_appointments,
          (SELECT count(*)::integer FROM beauty.services s
            WHERE s.professional_id=$1 AND s.active) AS active_services,
          (SELECT count(*)::integer FROM beauty.professional_follows f
            WHERE f.professional_id=$1) AS follower_count,
          (SELECT count(*)::integer FROM beauty.bookings b
            WHERE b.professional_id=$1 AND b.status='completed') AS completed_bookings`,
        [professionalId],
      ),
      db.query<{ count: number; rating: number | null }>(
        `SELECT count(*)::integer AS count,round(avg(r.rating),1)::float AS rating
          FROM beauty.reviews r
          JOIN beauty.bookings b ON b.id=r.booking_id
          WHERE b.professional_id=$1
            AND b.status='completed'
            AND r.moderation_status='visible'`,
        [professionalId],
      ),
      bookingPage(
        db,
        { role: "professional", id: professionalId },
        { view: "upcoming" },
      ),
    ]);

  const profile = profileResult.rows[0];
  // Do not call the authenticated wallet procedure if the requested profile
  // was not readable. This keeps an accidental foreign profile ID from
  // returning the current professional's financial summary alongside it.
  const wallet = profile ? await professionalWallet(db) : null;
  const stats = statsResult.rows[0] ?? {
    new_bookings: 0,
    upcoming_appointments: 0,
    active_services: 0,
    follower_count: 0,
    completed_bookings: 0,
  };
  const reviews = reviewResult.rows[0] ?? { count: 0, rating: null };
  return {
    profile: profile
      ? {
          businessName: profile.business_name,
          publicationStatus: profile.publication_status,
          slug: profile.slug,
        }
      : null,
    stats: {
      newBookings: stats.new_bookings,
      upcomingAppointments: stats.upcoming_appointments,
      activeServices: stats.active_services,
      reviewCount: reviews.count,
      rating: reviews.rating,
      followerCount: stats.follower_count,
      completedBookings: stats.completed_bookings,
    },
    upcoming: bookings.bookings.slice(0, 5),
    wallet: wallet ?? null,
  };
}

export type ProfessionalClient = {
  customer_id: string;
  customer_name: string;
  appointment_count: number;
  last_appointment_at: Date;
  next_appointment_at: Date | null;
};

/** Returns only customers with a genuine appointment relationship. */
export async function professionalClients(
  db: SqlClient,
  professionalId: string,
): Promise<ProfessionalClient[]> {
  return (
    await db.query<ProfessionalClient>(
      `SELECT b.customer_id,b.customer_name,count(*)::integer AS appointment_count,
          max(b.starts_at) AS last_appointment_at,
          min(b.starts_at) FILTER (WHERE b.starts_at >= now() AND b.status='confirmed') AS next_appointment_at
        FROM beauty.bookings b
        WHERE b.professional_id=$1
          AND b.status IN ('confirmed','completed','no_show','cancelled')
        GROUP BY b.customer_id,b.customer_name
        ORDER BY max(b.starts_at) DESC,b.customer_name ASC
        LIMIT 100`,
      [professionalId],
    )
  ).rows;
}

import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { bookingPage, type BookingRecord } from "@/modules/bookings/repository";
import { professionalWallet, type WalletOverview } from "@/modules/finance/repository";
import { liveEligibility, type LiveEligibility } from "@/modules/live/repository";

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
  live: LiveEligibility | null;
  plan: "starter" | "pro" | "premium";
  insights: {
    completedServiceValuePence: number;
    completedBookings: number;
    repeatClients: number;
    averageServiceValuePence: number;
    cancellationRate: number;
    busiestWeekday: string | null;
    quietestWeekday: string | null;
  } | null;
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
  const [profileResult, statsResult, reviewResult, bookings, planResult] =
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
      db.query<{ plan_key: "starter" | "pro" | "premium" }>(
        `SELECT coalesce((
          SELECT plan_key
          FROM beauty.professional_subscriptions
          WHERE professional_id=$1 AND status='active'
          LIMIT 1
        ),'starter') AS plan_key`,
        [professionalId],
      ),
    ]);

  const profile = profileResult.rows[0];
  // Do not call the authenticated wallet procedure if the requested profile
  // was not readable. This keeps an accidental foreign profile ID from
  // returning the current professional's financial summary alongside it.
  const wallet = profile ? await professionalWallet(db) : null;
  let live: LiveEligibility | null = null;
  if (profile) {
    try { live = await liveEligibility(db, professionalId); } catch { live = null; }
  }
  const stats = statsResult.rows[0] ?? {
    new_bookings: 0,
    upcoming_appointments: 0,
    active_services: 0,
    follower_count: 0,
    completed_bookings: 0,
  };
  const reviews = reviewResult.rows[0] ?? { count: 0, rating: null };
  const plan = planResult.rows[0]?.plan_key ?? "starter";
  let insights: ProfessionalDashboard["insights"] = null;
  if (profile && plan !== "starter") {
    const result = await db.query<{
      completed_service_value_pence: number;
      completed_bookings: number;
      repeat_clients: number;
      average_service_value_pence: number;
      cancellation_rate: number;
      busiest_weekday: string | null;
      quietest_weekday: string | null;
    }>(
      `WITH recent AS (
         SELECT b.*
         FROM beauty.bookings b
         WHERE b.professional_id=$1
           AND b.starts_at>=now()-interval '30 days'
       ),
       client_counts AS (
         SELECT customer_id,count(*)::integer AS appointments
         FROM beauty.bookings
         WHERE professional_id=$1 AND status='completed'
         GROUP BY customer_id
       ),
       weekday_counts AS (
         SELECT
           trim(to_char(starts_at AT TIME ZONE 'Europe/London','Day')) AS weekday,
           count(*)::integer AS appointments
         FROM recent
         WHERE status IN ('confirmed','completed','no_show','cancelled')
         GROUP BY 1
       )
       SELECT
         coalesce(sum(price_pence) FILTER(WHERE status='completed'),0)::integer
           AS completed_service_value_pence,
         count(*) FILTER(WHERE status='completed')::integer
           AS completed_bookings,
         coalesce((SELECT count(*)::integer FROM client_counts WHERE appointments>=2),0)
           AS repeat_clients,
         coalesce(round(avg(price_pence) FILTER(WHERE status='completed')),0)::integer
           AS average_service_value_pence,
         CASE
           WHEN count(*) FILTER(WHERE status IN ('confirmed','completed','no_show','cancelled'))=0 THEN 0
           ELSE round(
             100.0 * count(*) FILTER(WHERE status='cancelled')
             / count(*) FILTER(WHERE status IN ('confirmed','completed','no_show','cancelled')),
             1
           )::float
         END AS cancellation_rate,
         (SELECT weekday FROM weekday_counts ORDER BY appointments DESC,weekday ASC LIMIT 1)
           AS busiest_weekday,
         (SELECT weekday FROM weekday_counts ORDER BY appointments ASC,weekday ASC LIMIT 1)
           AS quietest_weekday
       FROM recent`,
      [professionalId],
    );
    const row = result.rows[0];
    insights = {
      completedServiceValuePence: row?.completed_service_value_pence ?? 0,
      completedBookings: row?.completed_bookings ?? 0,
      repeatClients: row?.repeat_clients ?? 0,
      averageServiceValuePence: row?.average_service_value_pence ?? 0,
      cancellationRate: row?.cancellation_rate ?? 0,
      busiestWeekday: row?.busiest_weekday ?? null,
      quietestWeekday: row?.quietest_weekday ?? null,
    };
  }
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
    live,
    plan,
    insights,
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

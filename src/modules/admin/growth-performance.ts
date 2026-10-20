import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";

export type GrowthPeriod = "week" | "month" | "year";
export type GrowthRow = {
  professionalId: string;
  businessName: string;
  completedBookings: number;
  uniqueClients: number;
  returningClients: number;
  professionalReplies: number;
  completedValuePence: number;
};
export function growthPeriod(value: string | undefined): GrowthPeriod {
  return value === "week" || value === "year" ? value : "month";
}
export async function ownerGrowthOverview(db: SqlClient, period: GrowthPeriod) {
  const interval = period === "week" ? "7 days" : period === "year" ? "1 year" : "1 month";
  // Only completed, paid, non-fully-refunded appointments contribute; no customer identities leave SQL.
  const rows = (await db.query<GrowthRow>(
    `WITH qualifying AS (
       SELECT b.professional_id, b.customer_id, b.id, b.price_pence,
              GREATEST(0, COALESCE(p.captured_pence,0)-COALESCE(p.refunded_pence,0)) AS net_paid
       FROM beauty.bookings b
       JOIN beauty.payments p ON p.booking_id=b.id
       WHERE b.completed_at IS NOT NULL
         AND b.completed_at >= NOW()-$1::interval
         AND b.completed_at <= NOW()
         AND b.status='completed'
         AND COALESCE(p.captured_pence,0)>COALESCE(p.refunded_pence,0)
     ),
     totals AS (
       SELECT q.professional_id,
         COUNT(DISTINCT q.id)::integer AS completed_bookings,
         COUNT(DISTINCT q.customer_id)::integer AS unique_clients,
         COALESCE(SUM(q.net_paid),0)::bigint AS completed_value_pence
       FROM qualifying q GROUP BY q.professional_id
     ),
     repeat_customers AS (
       SELECT professional_id, COUNT(*)::integer AS returning_clients
       FROM (SELECT professional_id,customer_id FROM qualifying GROUP BY professional_id,customer_id HAVING COUNT(*)>1) r
       GROUP BY professional_id
     )
     SELECT pro.id AS "professionalId",pro.business_name AS "businessName",
       t.completed_bookings AS "completedBookings",t.unique_clients AS "uniqueClients",
       COALESCE(rc.returning_clients,0) AS "returningClients",
       COALESCE(replies.reply_count,0) AS "professionalReplies",
       t.completed_value_pence::float8 AS "completedValuePence"
     FROM totals t
     JOIN beauty.professional_profiles pro ON pro.id=t.professional_id
     LEFT JOIN repeat_customers rc ON rc.professional_id=t.professional_id
     LEFT JOIN LATERAL (
       SELECT COUNT(m.id)::integer AS reply_count FROM beauty.messages m
       JOIN beauty.conversations c ON c.id=m.conversation_id
       WHERE c.professional_id=pro.id AND m.sender_user_id=pro.user_id
         AND m.sender_role='professional'
         AND m.created_at>=NOW()-$1::interval AND m.created_at<=NOW()
     ) replies ON true
     ORDER BY t.completed_bookings DESC,pro.business_name ASC LIMIT 100`,
    [interval],
  )).rows;
  return { period, rows };
}

export async function ownerReferralPeriod(db: SqlClient, period: GrowthPeriod) {
  const interval = period === "week" ? "7 days" : period === "year" ? "1 year" : "1 month";
  return (await db.query<{
    professionalId: string;
    businessName: string;
    referredAccounts: number;
    qualifiedReferrals: number;
  }>(
    `SELECT p.id AS "professionalId", p.business_name AS "businessName",
      COUNT(r.id)::integer AS "referredAccounts",
      COUNT(r.id) FILTER (WHERE r.qualified_at IS NOT NULL)::integer AS "qualifiedReferrals"
     FROM beauty.professional_referrals r
     JOIN beauty.professional_profiles p ON p.id=r.referrer_professional_id
     WHERE r.created_at>=NOW()-$1::interval AND r.created_at<=NOW()
     GROUP BY p.id,p.business_name
     ORDER BY "qualifiedReferrals" DESC, "referredAccounts" DESC LIMIT 100`,
    [interval],
  )).rows;
}

export async function ownerMeaningfulActivity(db: SqlClient, period: GrowthPeriod) {
  const interval = period === "week" ? "7 days" : period === "year" ? "1 year" : "1 month";
  return (await db.query<{professionalId:string;businessName:string;replies:number;conversations:number}>(
    `SELECT p.id AS "professionalId",p.business_name AS "businessName",
       COUNT(m.id)::integer AS replies,COUNT(DISTINCT c.id)::integer AS conversations
     FROM beauty.professional_profiles p
     JOIN beauty.conversations c ON c.professional_id=p.id
     JOIN beauty.messages m ON m.conversation_id=c.id
       AND m.sender_user_id=p.user_id AND m.sender_role='professional'
     WHERE m.created_at>=NOW()-$1::interval AND m.created_at<=NOW()
     GROUP BY p.id,p.business_name ORDER BY replies DESC,conversations DESC LIMIT 100`,
     [interval]
  )).rows;
}

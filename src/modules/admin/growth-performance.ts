import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";

export type GrowthPeriod = "week" | "month" | "year";
export type GrowthRow = {
  professionalId: string;
  businessName: string;
  completedBookings: number;
  uniqueClients: number;
  returningClients: number;
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
       t.completed_value_pence::float8 AS "completedValuePence"
     FROM totals t
     JOIN beauty.professionals pro ON pro.id=t.professional_id
     LEFT JOIN repeat_customers rc ON rc.professional_id=t.professional_id
     ORDER BY t.completed_bookings DESC,pro.business_name ASC LIMIT 100`,
    [interval],
  )).rows;
  return { period, rows };
}

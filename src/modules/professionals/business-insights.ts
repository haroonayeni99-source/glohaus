import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import type { GrowthPeriod } from "@/modules/admin/growth-performance";

export const reportingDays = {week:7, month:31, year:366} as const;
export function retentionWindow(value: string | undefined): 30 | 60 | 90 {
  return value === "60" ? 60 : value === "90" ? 90 : 30;
}

export const businessDisputesCte = `excluded_disputes AS MATERIALIZED (
  SELECT (item->>'bookingId')::uuid AS booking_id
  FROM jsonb_array_elements(beauty.my_booking_dispute_overview()->'disputes') item
)`;

export type BusinessInsights = {
  bookings:number; clients:number; returningClients:number; multipleVisitClients:number;
  serviceValuePence:number; netCapturedPence:number;
  cohortClients:number; cohortReturned:number; futureBookedClients:number;
};

// Business reporting deliberately differs from reward eligibility: partially
// refunded appointments retain their actual net captured value; no reward hold
// or incentive is applied. Every metric uses the same professional-scoped set.
export async function businessInsights(db:SqlClient, professionalId:string, period:GrowthPeriod, window:30|60|90):Promise<BusinessInsights> {
  const result=await db.query<BusinessInsights>(`
    WITH ${businessDisputesCte}, qualified AS MATERIALIZED (
      SELECT b.id,b.customer_id,b.completed_at,b.price_pence,
        (p.captured_pence::bigint-p.refunded_pence::bigint) AS net_captured
      FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
      WHERE b.professional_id=$1 AND b.status='completed' AND b.completed_at<=now()
        AND p.captured_pence>p.refunded_pence
        AND NOT EXISTS(SELECT 1 FROM excluded_disputes d WHERE d.booking_id=b.id)
    ), windowed AS (
      SELECT * FROM qualified WHERE completed_at>=now()-$2::integer*interval '1 day'
    ), first_visits AS (
      SELECT customer_id,min(completed_at) AS first_at FROM qualified GROUP BY customer_id
    ), cohort AS (
      SELECT f.* FROM first_visits f
      WHERE f.first_at>=now()-($2::integer+$3::integer)*interval '1 day'
        AND f.first_at<now()-$3::integer*interval '1 day'
    )
    SELECT count(*)::integer AS bookings,count(DISTINCT w.customer_id)::integer AS clients,
      count(DISTINCT w.customer_id) FILTER(WHERE EXISTS(
        SELECT 1 FROM qualified prior WHERE prior.customer_id=w.customer_id AND prior.completed_at<w.completed_at
      ))::integer AS "returningClients",
      (SELECT count(*)::integer FROM(SELECT customer_id FROM windowed GROUP BY customer_id HAVING count(*)>1) multi) AS "multipleVisitClients",
      coalesce(sum(w.price_pence),0)::float8 AS "serviceValuePence",
      coalesce(sum(w.net_captured),0)::float8 AS "netCapturedPence",
      (SELECT count(*)::integer FROM cohort) AS "cohortClients",
      (SELECT count(*)::integer FROM cohort c WHERE EXISTS(
        SELECT 1 FROM qualified next WHERE next.customer_id=c.customer_id
          AND next.completed_at>c.first_at AND next.completed_at<=c.first_at+$3::integer*interval '1 day'
      )) AS "cohortReturned",
      (SELECT count(DISTINCT x.customer_id)::integer FROM windowed x WHERE EXISTS(
        SELECT 1 FROM beauty.bookings future WHERE future.professional_id=$1 AND future.customer_id=x.customer_id
          AND future.status='confirmed' AND future.starts_at>now()
          AND NOT EXISTS(SELECT 1 FROM excluded_disputes d WHERE d.booking_id=future.id)
      )) AS "futureBookedClients"
    FROM windowed w`,[professionalId,reportingDays[period],window]);
  const row=result.rows[0];
  if(!row || Object.values(row).some(value=>!Number.isSafeInteger(value)||value<0))
    throw new Error("Business insights unavailable");
  return row;
}

import type { SqlClient } from "@/modules/accounts/repository";
import {
  defaultSellerSettings,
  type SellerSettings,
  type SellerOverview,
  type SellerProductInsight,
} from "./seller";

export async function sellerSettings(
  db: SqlClient,
  professionalId: string,
): Promise<SellerSettings> {
  const { rows } = await db.query<{
    away: boolean;
    awayUntil: string | Date | null;
  }>(
    `SELECT away,away_until AS "awayUntil" FROM beauty.seller_settings WHERE professional_id=$1`,
    [professionalId],
  );
  return rows[0]
    ? {
        away: rows[0].away,
        awayUntil: rows[0].awayUntil
          ? new Date(rows[0].awayUntil).toISOString()
          : null,
      }
    : { ...defaultSellerSettings };
}

export async function saveSellerSettings(
  db: SqlClient,
  professionalId: string,
  value: SellerSettings,
) {
  await db.query(
    `INSERT INTO beauty.seller_settings(professional_id,away,away_until)
    VALUES($1,$2,$3) ON CONFLICT(professional_id) DO UPDATE
    SET away=excluded.away,away_until=excluded.away_until,updated_at=now()`,
    [professionalId, value.away, value.awayUntil],
  );
  return sellerSettings(db, professionalId);
}

export async function sellerOverview(
  db: SqlClient,
  professionalId: string,
): Promise<SellerOverview> {
  const { rows } = await db.query<SellerOverview & Record<string, unknown>>(
    `SELECT
    (SELECT count(*)::int FROM beauty.products WHERE professional_id=$1 AND publication_status='published') AS "publishedProducts",
    (SELECT count(*)::int FROM beauty.products WHERE professional_id=$1 AND publication_status='published' AND stock_quantity<=5) AS "lowStockProducts",
    count(*) FILTER(WHERE status IN('paid','processing'))::int AS "openOrders",
    coalesce(sum(subtotal_pence) FILTER(WHERE created_at>=now()-interval '30 days' AND status IN('paid','processing','shipped','delivered')),0)::bigint::text AS "sales30DaysPence",
    count(*) FILTER(WHERE created_at>=now()-interval '30 days' AND status IN('paid','processing','shipped','delivered'))::int AS "paidOrders30Days",
    count(*) FILTER(WHERE created_at>=now()-interval '30 days' AND status IN('refund_pending','refunded'))::int AS "refundOrders30Days"
    FROM beauty.product_orders WHERE professional_id=$1`,
    [professionalId],
  );
  return { ...rows[0], sales30DaysPence: Number(rows[0].sales30DaysPence) };
}

export async function sellerProductInsights(
  db: SqlClient,
  professionalId: string,
): Promise<SellerProductInsight[]> {
  const { rows } = await db.query<
    SellerProductInsight & Record<string, unknown>
  >(
    `SELECT p.id AS "productId",p.name,
    coalesce(sum(i.quantity),0)::int AS units,coalesce(sum(i.line_total_pence),0)::bigint::text AS "salesPence"
    FROM beauty.products p
    LEFT JOIN beauty.product_order_items i ON i.product_id=p.id AND EXISTS(
      SELECT 1 FROM beauty.product_orders o WHERE o.id=i.order_id AND o.professional_id=$1
      AND o.created_at>=now()-interval '30 days' AND o.status IN('paid','processing','shipped','delivered'))
    WHERE p.professional_id=$1 GROUP BY p.id,p.name ORDER BY units DESC,p.name,p.id LIMIT 10`,
    [professionalId],
  );
  return rows.map((row) => ({ ...row, salesPence: Number(row.salesPence) }));
}

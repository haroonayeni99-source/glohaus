import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";

export type InAppNotification = {
  id: string;
  booking_id: string | null;
  product_order_id: string | null;
  kind:
    | "booking_created"
    | "booking_confirmed"
    | "booking_cancelled"
    | "appointment_completed"
    | "order_paid"
    | "order_processing"
    | "order_shipped"
    | "order_delivered"
    | "order_refund_pending"
    | "order_refunded";
  title: string;
  body: string;
  href: string;
  read_at: Date | null;
  created_at: Date;
};

export async function inAppNotifications(db: SqlClient) {
  return (
    await db.query<InAppNotification>(
      `SELECT id,booking_id,product_order_id,kind,title,body,href,read_at,created_at
       FROM beauty.in_app_notifications
       ORDER BY read_at NULLS FIRST,created_at DESC,id DESC
       LIMIT 100`,
    )
  ).rows;
}

/** A non-match is deliberately silent so a guessed ID reveals nothing. */
export async function markInAppNotificationRead(db: SqlClient, id: string) {
  return (
    await db.query<{ id: string }>(
      `UPDATE beauty.in_app_notifications
       SET read_at=coalesce(read_at,now())
       WHERE id=$1
       RETURNING id`,
      [id],
    )
  ).rows[0] ?? null;
}


export async function markAllInAppNotificationsRead(db: SqlClient) {
  const result = await db.query<{ count: number }>(
    `WITH updated AS (
       UPDATE beauty.in_app_notifications
       SET read_at=coalesce(read_at,now())
       WHERE read_at IS NULL
       RETURNING 1
     ) SELECT count(*)::integer AS count FROM updated`,
  );
  return result.rows[0]?.count ?? 0;
}

import "server-only";
import { bookingCursor } from "./listing";
import type { SqlClient } from "@/modules/accounts/repository";
export type BookingRecord = {
  id: string;
  service_name: string;
  customer_name: string;
  professional_name: string;
  starts_at: Date;
  ends_at: Date;
  price_pence: number;
  deposit_pence: number;
  status: string;
  cancellation_reason: string | null;
  captured_pence: number;
  refunded_pence: number;
  payment_status: string;
  completed_at: Date | null;
  has_ended: boolean;
};
export async function bookingPage(
  db: SqlClient,
  scope: { role: "customer" | "professional"; id: string },
  options: {
    view: import("./listing").BookingView;
    after?: import("./listing").BookingCursor;
  },
) {
  const upcoming =
    "(b.ends_at>now() AND (b.status='confirmed' OR (b.status='payment_pending' AND b.hold_expires_at>now())))";
  const direction = options.view === "upcoming" ? "ASC" : "DESC";
  const values: unknown[] = [scope.id];
  const where = [
    scope.role === "professional" ? "b.professional_id=$1" : "b.customer_id=$1",
  ];
  if (options.view === "upcoming") where.push(upcoming);
  if (options.view === "history") where.push(`NOT ${upcoming}`);
  if (options.after) {
    values.push(options.after.startsAt, options.after.id);
    where.push(
      `(b.starts_at,b.id) ${direction === "ASC" ? ">" : "<"} ($2::timestamptz,$3::uuid)`,
    );
  }
  const rows = (
    await db.query<BookingRecord>(
      `SELECT b.id,b.service_name,b.customer_name,b.professional_name,b.starts_at,b.ends_at,b.price_pence,b.deposit_pence,CASE WHEN b.status='payment_pending' AND b.hold_expires_at<=now() THEN 'expired' ELSE b.status END AS status,b.cancellation_reason,b.completed_at,(b.ends_at<=now()) AS has_ended,p.captured_pence,p.refunded_pence,p.status AS payment_status FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id WHERE ${where.join(" AND ")} ORDER BY b.starts_at ${direction},b.id ${direction} LIMIT 26`,
      values,
    )
  ).rows;
  const bookings = rows.slice(0, 25);
  return {
    bookings,
    next:
      rows.length > 25 ? bookingCursor(bookings[bookings.length - 1]) : null,
  };
}
export async function bookingById(db: SqlClient, id: string) {
  return (
    await db.query<BookingRecord>(
      "SELECT b.id,b.service_name,b.customer_name,b.professional_name,b.starts_at,b.ends_at,b.price_pence,b.deposit_pence,CASE WHEN b.status='payment_pending' AND b.hold_expires_at<=now() THEN 'expired' ELSE b.status END AS status,b.cancellation_reason,b.completed_at,(b.ends_at<=now()) AS has_ended,p.captured_pence,p.refunded_pence,p.status AS payment_status FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id WHERE b.id=$1",
      [id],
    )
  ).rows[0];
}

export async function checkoutReference(db: SqlClient, id: string) {
  const result = await db.query<{
    bookingId: string;
    sessionId: string;
    depositPence: number;
  }>(
    `SELECT b.id AS "bookingId",p.stripe_session_id AS "sessionId",b.deposit_pence AS "depositPence" FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id JOIN beauty.users u ON u.id=b.customer_id WHERE b.id=$1 AND u.auth_id=beauty.auth_id() AND u.status='active' AND b.status='payment_pending' AND b.hold_expires_at>now() AND p.captured_pence=0 AND p.stripe_session_id IS NOT NULL`,
    [id],
  );
  return result.rows[0];
}

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { SqlClient } from "@/modules/accounts/repository";
import { encryptionReady, seal, unseal } from "./secrets";

const purpose = "calendar-subscription:v1";
const claims = z.object({ authId: z.string().min(1).max(128), professionalId: z.uuid(), nonce: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export function subscriptionReady() {
  return process.env.CALENDAR_SUBSCRIPTION_ENABLED === "true" && encryptionReady();
}
export function subscriptionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function subscriptionClaims(token: string) {
  if (token.length > 1500) throw Error("INVALID_SUBSCRIPTION");
  return claims.parse(unseal(token, purpose));
}
export async function createSubscription(db: SqlClient, authId: string, professionalId: string) {
  const token = seal(claims.parse({ authId, professionalId, nonce: randomBytes(32).toString("hex") }), purpose);
  await db.query(`INSERT INTO beauty.calendar_subscriptions(professional_id,token_hash) VALUES($1,$2)
    ON CONFLICT(professional_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_at=now()`, [professionalId, subscriptionHash(token)]);
  return `https://www.glohaus.shop/api/calendar/subscription/${token}`;
}
export async function revokeSubscription(db: SqlClient, professionalId: string) {
  await db.query("DELETE FROM beauty.calendar_subscriptions WHERE professional_id=$1", [professionalId]);
}
export type SubscriptionBooking = { id: string; starts_at: string | Date; ends_at: string | Date; status: string };
export async function subscriptionBookings(db: SqlClient, professionalId: string, token: string) {
  // Hold the row until the snapshot is read, serialising concurrent revocation.
  const access = await db.query(`SELECT professional_id FROM beauty.calendar_subscriptions WHERE professional_id=$1 AND token_hash=$2 FOR SHARE`, [professionalId, subscriptionHash(token)]);
  if (!access.rows.length) return null;
  const result = await db.query<SubscriptionBooking>(`SELECT id,starts_at,ends_at,status FROM beauty.bookings
    WHERE professional_id=$1 AND ends_at>now()-interval '90 days' AND starts_at<now()+interval '366 days'
    AND status IN('confirmed','completed','cancelled','no_show') ORDER BY starts_at,id LIMIT 5001`, [professionalId]);
  // An incomplete snapshot could erase appointments in the subscribing client.
  if (result.rows.length > 5000) throw Error("SUBSCRIPTION_LIMIT");
  return result.rows;
}
function stamp(value: string | Date) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
export function subscriptionCalendar(bookings: SubscriptionBooking[], generatedAt = new Date()) {
  const dtstamp = stamp(generatedAt);
  const events = bookings.flatMap(b => [
    "BEGIN:VEVENT", `UID:glohaus-${z.uuid().parse(b.id)}@glohaus.shop`, `DTSTAMP:${dtstamp}`,
    `DTSTART:${stamp(b.starts_at)}`, `DTEND:${stamp(b.ends_at)}`,
    "SUMMARY:GLOHAUS appointment", "CLASS:PRIVATE",
    `STATUS:${["cancelled", "no_show"].includes(b.status) ? "CANCELLED" : "CONFIRMED"}`,
    `TRANSP:${["cancelled", "no_show"].includes(b.status) ? "TRANSPARENT" : "OPAQUE"}`,
    "END:VEVENT",
  ]);
  // UTC instants preserve UK daylight-saving changes without floating times.
  // Never include names, treatments, addresses, notes, prices or booking links.
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GLOHAUS//Private booking subscription//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:GLOHAUS appointments", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", ...events, "END:VCALENDAR", ""].join("\r\n");
}

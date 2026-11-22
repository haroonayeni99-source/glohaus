import { withIdentity } from "@/lib/db";
import { subscriptionBookings, subscriptionCalendar, subscriptionClaims, subscriptionReady } from "@/modules/business-tools/subscription";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!subscriptionReady()) return new Response(null, { status: 404, headers });
  const { token } = await params;
  let access;
  try { access = subscriptionClaims(token); }
  catch { return new Response(null, { status: 404, headers }); }
  try {
    const bookings = await withIdentity(access.authId, db => subscriptionBookings(db, access.professionalId, token));
    if (!bookings) return new Response(null, { status: 404, headers });
    return new Response(subscriptionCalendar(bookings), { headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="glohaus-appointments.ics"' } });
  } catch {
    // Never send an empty successful calendar on a DB failure, or log the token.
    return new Response(null, { status: 503, headers: { ...headers, "Retry-After": "300" } });
  }
}

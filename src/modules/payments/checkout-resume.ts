import { AccessError } from "@/modules/accounts/domain";
export type CheckoutReference = {
  bookingId: string;
  sessionId: string;
  depositPence: number;
};
export type CheckoutSessionState = {
  id: string;
  metadata: Record<string, string> | null;
  amount_total: number | null;
  currency: string | null;
  status: string | null;
  payment_status: string;
  url: string | null;
  expires_at: number;
};
export function resumedCheckoutUrl(
  reference: CheckoutReference,
  session: CheckoutSessionState,
  now: number,
): string {
  if (
    session.id !== reference.sessionId ||
    session.metadata?.booking_id !== reference.bookingId ||
    session.amount_total !== reference.depositPence ||
    session.currency !== "gbp"
  )
    throw new AccessError("UNAVAILABLE", 503);
  if (
    session.status !== "open" ||
    session.payment_status !== "unpaid" ||
    session.expires_at * 1000 <= now ||
    !session.url
  )
    throw new AccessError("INVALID_REQUEST", 409);
  let url: URL;
  try {
    url = new URL(session.url);
  } catch {
    throw new AccessError("UNAVAILABLE", 503);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new AccessError("UNAVAILABLE", 503);
  return url.href;
}

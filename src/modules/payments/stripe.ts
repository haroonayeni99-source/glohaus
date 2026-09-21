import "server-only";
import Stripe from "stripe";
import { AccessError } from "@/modules/accounts/domain";
let client: Stripe | undefined;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new AccessError("UNAVAILABLE", 503);
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 15000,
  }));
}
export function paymentReady() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.PAYMENT_DATABASE_URL &&
    process.env.NEXT_PUBLIC_APP_URL,
  );
}

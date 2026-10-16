import type { PolicyPreview } from "@/modules/policies/domain";
export type Notification = {
  id: string;
  booking_id: string;
  kind:
    | "confirmation"
    | "cancellation"
    | "reminder"
    | "review_request"
    | "rescheduled"
    | "late_notice"
    | "requirements_update";
  email: string;
  service_name: string;
  professional_name: string;
  starts_at: Date | string;
  accepted_policy?: (PolicyPreview & { acknowledgedAt: string }) | null;
};
function acceptedPolicyCopy(
  policy: NonNullable<Notification["accepted_policy"]>,
) {
  const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;
  const r = policy.rules;
  return [
    "Your accepted booking policies (copy for your records)",
    `General version: ${policy.generalVersionId || "GLOHAUS default"}. Service version: ${policy.serviceVersionId || "General/default"}. Acknowledged: ${policy.acknowledgedAt}.`,
    `Service price ${money(policy.pricePence)}. ${policy.fullPrepayment ? "Full service prepayment" : "Deposit"} ${money(policy.depositPence)}. Booking fee ${money(policy.bookingFeePence)}. Pay now ${money(policy.depositPence + policy.bookingFeePence)}.`,
    `Cancellation notice: ${r.cancellationHours} hours. Timely cancellations and professional cancellations receive a full refund. Later cancellations require an individual assessment; any retention must reflect evidenced actual losses, steps to reduce those losses and GLOHAUS review.`,
    "For an online booking, you can cancel an unperformed service without giving a reason in the 14-day cooling-off period starting the day after booking. Use Cancel appointment in your booking or contact GLOHAUS. Requesting an earlier appointment does not automatically waive that right. Any lawful payment for work already provided needs a separate assessment. Service-quality rights still apply.",
    `Late-arrival grace: ${r.graceMinutes} minutes. ${r.lateInstructions || "Contact the professional if delayed."} Being marked late does not automatically forfeit payment. Shortening requires your agreement.`,
    `Rescheduling: ${r.rescheduleHours} hours' notice; up to ${r.maxReschedules} customer-initiated changes. ${r.freeReschedule ? "One free available change; further permitted changes need approval." : "Professional approval and availability required."} No automatic rescheduling charge.`,
    `Guests: ${r.guests}. Accompanying children: ${r.children}. Reasonable accessibility arrangements and lawful exceptions remain available.`,
    `Preparation: ${Array.from(new Set(r.preparation)).join(", ").replaceAll("_", " ") || "No template requirements"}. ${r.preparationText}`,
    `Required before treatment: ${[r.requireReferences && "reference photographs", r.requireConsultation && "consultation", r.requirePatchTest && "patch test"].filter(Boolean).join(", ") || "No additional policy checks"}. These do not replace informed clinical consent or screening.`,
    r.restrictions && `Service restrictions: ${r.restrictions}`,
    policy.generalCustomRules &&
      `General additional rules: ${policy.generalCustomRules}`,
    policy.serviceCustomRules &&
      `Service additional rules: ${policy.serviceCustomRules}`,
    "Statutory rights and GLOHAUS refund protections take priority over custom rules. No automatic penalties apply. Payments stay within GLOHAUS. Later policy updates do not change these accepted terms.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function notificationEmail(notification: Notification, origin: string) {
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol))
    throw new Error("INVALID_ORIGIN");
  const headings = {
    confirmation: "Your appointment is confirmed",
    cancellation: "Your appointment has been cancelled",
    reminder: "A little reminder about your appointment",
    review_request: "How was your appointment?",
    rescheduled: "Your appointment has a rescheduling update",
    late_notice: "Your appointment has an arrival update",
    requirements_update: "Your appointment preparation has an update",
  };
  const when = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(notification.starts_at));
  return {
    subject: `GLOHAUS · ${headings[notification.kind]}`,
    text: `${headings[notification.kind]}.\n\n${notification.service_name} with ${notification.professional_name}\nBooking reference: ${notification.booking_id}\n${when} (London time)\n\n${notification.kind === "cancellation" ? "Any deposit refund is handled separately under the booking policy. Check your appointment for the latest status.\n\n" : ""}View your appointment securely: ${base.origin}/account/bookings/${encodeURIComponent(notification.booking_id)}\n\n${notification.kind === "confirmation" && notification.accepted_policy ? acceptedPolicyCopy(notification.accepted_policy) + "\n\n" : ""}The GLOHAUS team`,
  };
}

export type ProductOrderNotification = {
  id: string;
  product_order_id: string;
  kind:
    | "order_paid_customer"
    | "order_paid_professional"
    | "order_shipped_customer"
    | "order_delivered_professional"
    | "order_refunded_customer";
  email: string;
  professional_name: string;
  total_pence: number;
  product_summary?: string | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  shipped_at: Date | string | null;
  delivered_at: Date | string | null;
};

export function productOrderNotificationEmail(
  notification: ProductOrderNotification,
  origin: string,
) {
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol))
    throw new Error("INVALID_ORIGIN");

  const total = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(notification.total_pence / 100);

  const customerUrl = `${base.origin}/account/orders`;
  const professionalUrl = `${base.origin}/professional/orders`;
  const reference = `Order reference: ${notification.product_order_id}\n${notification.product_summary ? `Items: ${notification.product_summary}\n` : ""}`;

  switch (notification.kind) {
    case "order_paid_customer":
      return {
        subject: "GLOHAUS · Your Shop order is confirmed",
        text: `Your GLOHAUS Shop order with ${notification.professional_name} is confirmed.\n\nOrder total: ${total}\n\nTrack your order securely: ${customerUrl}\n\nThe GLOHAUS team`,
      };
    case "order_paid_professional":
      return {
        subject: "GLOHAUS · New Shop order",
        text: `You have a new paid GLOHAUS Shop order.\n\n${reference}\nOrder total: ${total}\n\nPrepare and dispatch the order from your professional workspace: ${professionalUrl}\n\nTracking is required before an order can be marked as shipped.\n\nThe GLOHAUS team`,
      };
    case "order_shipped_customer":
      return {
        subject: "GLOHAUS · Your order has shipped",
        text: `Your GLOHAUS Shop order from ${notification.professional_name} has shipped.\n\nCarrier: ${notification.tracking_carrier ?? "See order"}\nTracking number: ${notification.tracking_number ?? "See order"}\n\nOpen your order to track the parcel: ${customerUrl}\n\nThe GLOHAUS team`,
      };
    case "order_delivered_professional":
      return {
        subject: "GLOHAUS · Customer confirmed delivery",
        text: `The customer confirmed delivery of a GLOHAUS Shop order.\n\nOrder total: ${total}\n\nProtected product proceeds follow the GLOHAUS release window.\n\nView the order: ${professionalUrl}\n\nThe GLOHAUS team`,
      };
    case "order_refunded_customer":
      return {
        subject: "GLOHAUS · Your Shop refund is confirmed",
        text: `The payment provider confirmed the refund for your GLOHAUS Shop order.\n\nOrder total: ${total}\n\nYour bank may take additional time to display the returned funds.\n\nView the order: ${customerUrl}\n\nThe GLOHAUS team`,
      };
  }
}

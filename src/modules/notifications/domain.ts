export type Notification = {
  id: string;
  booking_id: string;
  kind: "confirmation" | "cancellation" | "reminder" | "review_request";
  email: string;
  service_name: string;
  professional_name: string;
  starts_at: Date | string;
};
export function notificationEmail(notification: Notification, origin: string) {
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol))
    throw new Error("INVALID_ORIGIN");
  const headings = {
    confirmation: "Your appointment is confirmed",
    cancellation: "Your appointment has been cancelled",
    reminder: "A little reminder about your appointment",
    review_request: "How was your appointment?",
  };
  const when = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(notification.starts_at));
  return {
    subject: `GLOHAUS · ${headings[notification.kind]}`,
    text: `${headings[notification.kind]}.\n\n${notification.service_name} with ${notification.professional_name}\n${when} (London time)\n\n${notification.kind === "cancellation" ? "Any deposit refund is handled separately under the booking policy. Check your appointment for the latest status.\n\n" : ""}View your appointment securely: ${base.origin}/account/bookings/${encodeURIComponent(notification.booking_id)}\n\nThe GLOHAUS team`,
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

  switch (notification.kind) {
    case "order_paid_customer":
      return {
        subject: "GLOHAUS · Your Shop order is confirmed",
        text: `Your GLOHAUS Shop order with ${notification.professional_name} is confirmed.\n\nOrder total: ${total}\n\nTrack your order securely: ${customerUrl}\n\nThe GLOHAUS team`,
      };
    case "order_paid_professional":
      return {
        subject: "GLOHAUS · New Shop order",
        text: `You have a new paid GLOHAUS Shop order.\n\nOrder total: ${total}\n\nPrepare and dispatch the order from your professional workspace: ${professionalUrl}\n\nTracking is required before an order can be marked as shipped.\n\nThe GLOHAUS team`,
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

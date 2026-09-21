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
    subject: `glohaus · ${headings[notification.kind]}`,
    text: `${headings[notification.kind]}.\n\n${notification.service_name} with ${notification.professional_name}\n${when} (London time)\n\n${notification.kind === "cancellation" ? "Any deposit refund is handled separately under the booking policy. Check your appointment for the latest status.\n\n" : ""}View your appointment securely: ${base.origin}/account/bookings/${encodeURIComponent(notification.booking_id)}\n\nThe glohaus team`,
  };
}

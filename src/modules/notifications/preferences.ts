import { z } from "zod";
export const notificationCategories = [
  "bookings",
  "orders",
  "changes",
  "messages",
  "reminders",
  "reviews",
  "promotions",
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];
export const mandatoryEmail = new Set<NotificationCategory>([
  "bookings",
  "orders",
  "changes",
]);
export const notificationLabels: Record<NotificationCategory, string> = {
  bookings: "New bookings",
  orders: "Marketplace orders",
  changes: "Cancellations and reschedules",
  messages: "Customer messages",
  reminders: "Appointment reminders",
  reviews: "Reviews",
  promotions: "Promotional messages",
};
export const preferenceSchema = z
  .object({
    category: z.enum(notificationCategories),
    email: z.boolean(),
    push: z.boolean(),
  })
  .strict()
  .refine(
    (v) => !mandatoryEmail.has(v.category) || v.email,
    "Essential email alerts stay enabled",
  );
export type NotificationPreference = z.infer<typeof preferenceSchema>;
export const subscriptionSchema = z
  .object({
    endpoint: z.url().max(2048).refine(isPushEndpoint),
    keys: z
      .object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
      })
      .strict(),
    label: z.string().trim().min(1).max(80),
  })
  .strict();
// Push endpoints are server outbound destinations. Restrict to browser push
// providers, HTTPS/443, and no credentials; never accept arbitrary URLs (SSRF).
export function isPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "android.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname === "push.services.mozilla.com" ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname.endsWith(".notify.windows.com") ||
        u.hostname === "wns.windows.com")
    );
  } catch {
    return false;
  }
}
export function safeNotificationHref(href: string) {
  return /^\/(?!\/)[a-zA-Z0-9_/?=&-]*$/.test(href)
    ? href
    : "/notifications?view=professional";
}

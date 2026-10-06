import { it, expect } from "vitest";
import {
  notificationEmail,
  productOrderNotificationEmail,
} from "@/modules/notifications/domain";
const notification = {
  id: "job",
  booking_id: "booking",
  kind: "confirmation" as const,
  email: "a@example.test",
  service_name: "Manicure",
  professional_name: "Studio",
  starts_at: "2026-10-26T10:00:00Z",
};
it("uses a protected booking link and London appointment time", () => {
  const email = notificationEmail(notification, "https://glohaus.example/path");
  expect(email.text).toContain(
    "https://glohaus.example/account/bookings/booking",
  );
  expect(email.text).toContain("10:00");
  expect(email.text).not.toContain("a@example.test");
});
it("does not promise a refund in cancellation notifications", () => {
  expect(
    notificationEmail(
      { ...notification, kind: "cancellation" },
      "https://glohaus.example",
    ).text,
  ).toContain("refund is handled separately");
});
it("keeps user content in plain text without evaluating markup", () => {
  expect(
    notificationEmail(
      { ...notification, service_name: "<script>unsafe</script>" },
      "https://glohaus.example",
    ),
  ).not.toHaveProperty("html");
});


const productNotification = {
  id: "product-job",
  product_order_id: "order",
  kind: "order_shipped_customer" as const,
  email: "customer@example.test",
  professional_name: "Glow Studio",
  total_pence: 5399,
  tracking_carrier: "Royal Mail",
  tracking_number: "TRACK123",
  shipped_at: "2026-10-06T12:00:00Z",
  delivered_at: null,
};

it("includes tracking details in shipped Shop order emails", () => {
  const email = productOrderNotificationEmail(
    productNotification,
    "https://www.glohaus.shop",
  );
  expect(email.subject).toContain("shipped");
  expect(email.text).toContain("Royal Mail");
  expect(email.text).toContain("TRACK123");
  expect(email.text).toContain("https://www.glohaus.shop/account/orders");
});

it("tells professionals that Shop shipments require tracking", () => {
  const email = productOrderNotificationEmail(
    {
      ...productNotification,
      kind: "order_paid_professional",
      tracking_carrier: null,
      tracking_number: null,
    },
    "https://www.glohaus.shop",
  );
  expect(email.text).toContain("Tracking is required");
  expect(email.text).toContain("https://www.glohaus.shop/professional/orders");
});

it("does not expose recipient email inside Shop email content", () => {
  const email = productOrderNotificationEmail(
    { ...productNotification, kind: "order_paid_customer" },
    "https://www.glohaus.shop",
  );
  expect(email.text).not.toContain(productNotification.email);
});

import { it, expect } from "vitest";
import { notificationEmail } from "@/modules/notifications/domain";
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

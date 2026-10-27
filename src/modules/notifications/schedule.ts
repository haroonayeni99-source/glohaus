import "server-only";
import { after } from "next/server";
import { scheduleBusinessToolsSync } from "@/modules/business-tools/worker";
// Durable DB outboxes are authoritative. Post-response delivery is a latency
// improvement; cron recovers failures and interrupted invocations.
export function scheduleNotificationDelivery() {
  scheduleBusinessToolsSync();
  try {
    after(async () => {
      try {
        const { runNotificationWorker } = await import("./worker");
        await runNotificationWorker();
      } catch {
        console.error(
          "Notification delivery pending; scheduled worker will retry",
        );
      }
    });
  } catch {
    console.error("Notification scheduling deferred to cron");
  }
}

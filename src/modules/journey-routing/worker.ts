import "server-only";
import { withPaymentWorker } from "@/modules/payments/worker";
import { decryptOrigin, routingConfigured } from "./crypto";
import { estimateRoute } from "./google";
import { RoutingError, type RouteContext } from "./domain";

export async function refreshJourneyRoutes() {
  await withPaymentWorker((db) =>
    db.query("SELECT beauty.cleanup_journey_routes()"),
  );
  if (!routingConfigured())
    return { configured: false, processed: 0, updated: 0 };
  const jobs = await withPaymentWorker(async (db) =>
    (
      await db.query<{ data: RouteContext }>(
        "SELECT beauty.claim_journey_route_refreshes() AS data",
      )
    ).rows.map((r) => r.data),
  );
  let updated = 0;
  // Five bounded leases, parallel provider requests, no database transaction held
  // across network calls. Completion rechecks cancellation/version/consent.
  await Promise.all(
    jobs.map(async (job) => {
      let payload: object;
      try {
        let origin;
        try {
          origin = decryptOrigin(job.ciphertext!, job.bookingId);
        } catch {
          throw new RoutingError("ROUTE_ORIGIN_UNAVAILABLE");
        }
        const estimate = await estimateRoute(
          origin,
          job,
          job.mode!,
          job.bufferMinutes!,
        );
        payload = {
          durationMinutes: estimate.durationMinutes,
          mode: job.mode,
          bufferMinutes: job.bufferMinutes,
          reminders: true,
          automaticUpdates: true,
        };
      } catch (error) {
        payload = {
          error:
            error instanceof RoutingError
              ? error.code
              : "ROUTE_PROVIDER_UNAVAILABLE",
        };
      }
      try {
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_journey_route($1,$2,$3::jsonb,$4)", [
            job.bookingId,
            job.token,
            JSON.stringify(payload),
            job.ciphertext,
          ]),
        );
        if (!("error" in payload)) updated++;
      } catch {
        /* A revoked lease or changed booking must not be restored. */
      }
    }),
  );
  return { configured: true, processed: jobs.length, updated };
}

import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import {
  routeInputSchema,
  RoutingError,
  type RouteContext,
} from "@/modules/journey-routing/domain";
import {
  encryptOrigin,
  routingConfigured,
} from "@/modules/journey-routing/crypto";
import { estimateRoute } from "@/modules/journey-routing/google";
import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";

type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (
    [
      "ROUTE_RATE_LIMIT",
      "ROUTE_BUDGET_LIMIT",
      "ROUTE_CHANGED",
      "ROUTING_UNAVAILABLE",
      "ROUTING_NOT_CONFIGURED",
      "ROUTE_NOT_FOUND",
      "ROUTE_PROVIDER_LIMIT",
      "ROUTE_PROVIDER_UNAVAILABLE",
    ].includes(code)
  )
    return json(
      { error: { code } },
      code === "ROUTE_RATE_LIMIT" || code === "ROUTE_BUDGET_LIMIT"
        ? 429
        : code === "ROUTE_CHANGED"
          ? 409
          : 503,
    );
  return apiError(error);
}
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    const status = await withAccount(
      "customer",
      async (db) =>
        (
          await db.query<{ data: object }>(
            "SELECT beauty.customer_journey_route($1) AS data",
            [id],
          )
        ).rows[0].data,
    );
    return json({ ...status, configured: routingConfigured() });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, context: Context) {
  let reservation: RouteContext | undefined;
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = routeInputSchema.safeParse(await smallJson(request, 2048));
    if (!z.uuid().safeParse(id).success || !input.success)
      throw new AccessError("INVALID_REQUEST", 400);
    // Authenticate and authorize the booking before checking provider availability.
    reservation = await withAccount("customer", async (db) => {
      await db.query("SELECT beauty.customer_journey_route($1)", [id]);
      if (!routingConfigured())
        throw new RoutingError("ROUTING_NOT_CONFIGURED");
      return (
        await db.query<{ data: RouteContext }>(
          "SELECT beauty.reserve_customer_journey_route($1) AS data",
          [id],
        )
      ).rows[0].data;
    });
    const data = input.data;
    const estimate = await estimateRoute(
      data.origin,
      reservation,
      data.mode,
      data.bufferMinutes,
    );
    const payload = {
      durationMinutes: estimate.durationMinutes,
      mode: data.mode,
      bufferMinutes: data.bufferMinutes,
      reminders: data.reminders,
      automaticUpdates: data.automaticUpdates,
    };
    const state = await withAccount(
      "customer",
      async (db) =>
        (
          await db.query<{ data: unknown }>(
            "SELECT beauty.save_customer_journey_route($1,$2,$3::jsonb,$4) AS data",
            [
              id,
              reservation!.token,
              JSON.stringify(payload),
              data.automaticUpdates ? encryptOrigin(data.origin, id) : null,
            ],
          )
        ).rows[0].data,
    );
    scheduleNotificationDelivery();
    return json({ state, estimate, automaticUpdates: data.automaticUpdates });
  } catch (e) {
    if (reservation && e instanceof RoutingError) {
      await withAccount("customer", (db) =>
        db.query(
          "SELECT beauty.save_customer_journey_route($1,$2,$3::jsonb,NULL)",
          [
            reservation!.bookingId,
            reservation!.token,
            JSON.stringify({ error: e.code }),
          ],
        ),
      ).catch(() => {});
    }
    return failure(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("customer", (db) =>
      db.query("SELECT beauty.stop_customer_route_refresh($1)", [id]),
    );
    return json({ stopped: true });
  } catch (e) {
    return failure(e);
  }
}

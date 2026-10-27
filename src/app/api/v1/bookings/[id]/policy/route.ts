import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
import { refreshServiceCalendars } from "@/modules/business-tools/worker";
import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { bookingPolicy } from "@/modules/policies/repository";
import { policyBookingSchema } from "@/modules/policies/domain";
import { policyError } from "@/modules/policies/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    return json(await withAccount(undefined, (db) => bookingPolicy(db, id)));
  } catch (e) {
    return policyError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const p = policyBookingSchema.safeParse(await smallJson(request, 8192));
    if (!p.success || !z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    if (["reschedule","approve_reschedule"].includes(p.data.action)) {
      const serviceId=await withAccount(undefined,async db => {
        await db.query("SELECT beauty.booking_policy_overview($1)",[id]);
        return (await db.query<{service_id:string}>("SELECT service_id FROM beauty.bookings WHERE id=$1",[id])).rows[0]?.service_id;
      });
      if(serviceId)await refreshServiceCalendars(serviceId,true);
    }
    const result = await withAccount(
        undefined,
        async (db) =>
          (
            await db.query<{ data: unknown }>(
              "SELECT beauty.policy_booking_action($1,$2::jsonb) AS data",
              [id, JSON.stringify(p.data)],
            )
          ).rows[0].data,
      );
    scheduleNotificationDelivery();
    return json(result);
  } catch (e) {
    return policyError(e);
  }
}

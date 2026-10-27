import { z } from "zod";
import { refreshServiceCalendars } from "@/modules/business-tools/worker";
import { withAccount } from "@/lib/api-account";
import { json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { appointmentSlots, type Rule } from "@/modules/availability/domain";
import { policyError } from "@/modules/policies/http";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const date = new URL(request.url).searchParams.get("date") || "";
    if (
      !z.uuid().safeParse(id).success ||
      !z.iso.date().safeParse(date).success
    )
      throw new AccessError("INVALID_REQUEST", 400);
    const serviceId=await withAccount(undefined,async db => {
      await db.query("SELECT beauty.booking_policy_overview($1)",[id]);
      return (await db.query<{service_id:string}>("SELECT service_id FROM beauty.bookings WHERE id=$1",[id])).rows[0]?.service_id;
    });
    if(serviceId)await refreshServiceCalendars(serviceId);
    const slots = await withAccount(undefined, async (db) => {
      await db.query("SELECT beauty.booking_policy_overview($1)", [id]);
      const b = (
        await db.query<{ professional_id: string; duration_minutes: number }>(
          "SELECT professional_id,duration_minutes FROM beauty.bookings WHERE id=$1",
          [id],
        )
      ).rows[0];
      const rules = (
        await db.query<Rule>(
          'SELECT weekday,start_minute AS "startMinute",end_minute AS "endMinute" FROM beauty.public_hours WHERE professional_id=$1',
          [b.professional_id],
        )
      ).rows;
      const start = Date.parse(date + "T00:00:00Z") - 7200000;
      const busy = (
        await db.query<{ starts_at: Date; ends_at: Date }>(
          "SELECT * FROM beauty.policy_reschedule_busy($1,$2,$3)",
          [
            id,
            new Date(start).toISOString(),
            new Date(start + 28 * 3600000).toISOString(),
          ],
        )
      ).rows.map((x) => ({
        start: new Date(x.starts_at).getTime(),
        end: new Date(x.ends_at).getTime(),
      }));
      return appointmentSlots(
        date,
        b.duration_minutes,
        rules,
        busy,
        Date.now(),
      );
    });
    return json({ slots, timezone: "Europe/London" });
  } catch (e) {
    return policyError(e);
  }
}

import { z } from "zod";
import { withIdentity } from "@/lib/db";
import { apiError, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { appointmentSlots, type Rule } from "@/modules/availability/domain";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const serviceId = params.get("serviceId");
    const date = params.get("date") || "";
    if (
      !z.uuid().safeParse(serviceId).success ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    )
      throw new AccessError("INVALID_REQUEST", 400);
    const slots = await withIdentity("", async (db) => {
      const service = (
        await db.query<{ professional_id: string; duration_minutes: number }>(
          "SELECT professional_id,duration_minutes FROM beauty.public_services WHERE id=$1",
          [serviceId],
        )
      ).rows[0];
      if (!service) return [];
      const rules = (
        await db.query<Rule>(
          'SELECT weekday,start_minute AS "startMinute",end_minute AS "endMinute" FROM beauty.public_hours WHERE professional_id=$1',
          [service.professional_id],
        )
      ).rows;
      const start = Date.parse(`${date}T00:00:00Z`) - 7200000;
      const busy = (
        await db.query<{ starts_at: Date; ends_at: Date }>(
          "SELECT * FROM beauty.booking_busy($1,$2,$3)",
          [
            service.professional_id,
            new Date(start).toISOString(),
            new Date(start + 28 * 3600000).toISOString(),
          ],
        )
      ).rows.map((b) => ({
        start: new Date(b.starts_at).getTime(),
        end: new Date(b.ends_at).getTime(),
      }));
      return appointmentSlots(
        date,
        service.duration_minutes,
        rules,
        busy,
        Date.now(),
      );
    });
    return json({ slots, timezone: "Europe/London" });
  } catch (error) {
    return apiError(error);
  }
}
